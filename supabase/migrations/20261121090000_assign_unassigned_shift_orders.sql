-- Assign completed-but-unassigned orders to the open shift, safely.
--
-- Replaces the server action's direct `update orders set shift_id = ...`, which:
--   - moved EVERY unassigned completed order (weeks old included) into the
--     current shift's expected cash;
--   - let any staff member do it, even on a shift they could not manage;
--   - left no record of who moved what.
--
-- 1. shift_order_assignments: append-only audit of each manual assignment.
--    Read-only to restaurant management via RLS; written only by the RPC.
-- 2. unassigned_shift_order_window_start: orders completed before this time
--    belong to a business day that is already closed (or, if no day was ever
--    closed, to more than 24h before the current day opened) and are never
--    eligible.
-- 3. assign_unassigned_orders_to_open_shift: the shift opener or management
--    assigns a chosen list of eligible orders to the open shift. Every id must
--    be eligible or nothing is assigned. Returns the number assigned.
--
-- No existing function, policy or financial row is changed.

begin;
set local lock_timeout = '5s';

create table if not exists public.shift_order_assignments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  shift_id uuid not null,
  order_id uuid not null,
  assigned_by_user_id uuid not null,
  assigned_at timestamptz not null default now(),
  constraint shift_order_assignments_shift_tenant_fkey
    foreign key (shift_id, restaurant_id)
    references public.restaurant_shifts(id, restaurant_id) on delete cascade,
  constraint shift_order_assignments_order_tenant_fkey
    foreign key (order_id, restaurant_id)
    references public.orders(id, restaurant_id) on delete cascade
);

create index if not exists idx_shift_order_assignments_shift
on public.shift_order_assignments(restaurant_id, shift_id, assigned_at);
create index if not exists idx_shift_order_assignments_order
on public.shift_order_assignments(restaurant_id, order_id);

alter table public.shift_order_assignments enable row level security;

drop policy if exists "Restaurant managers can read shift order assignments"
on public.shift_order_assignments;
create policy "Restaurant managers can read shift order assignments"
on public.shift_order_assignments for select
using (
  public.is_restaurant_member(
    shift_order_assignments.restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
);

revoke all on public.shift_order_assignments from anon;
revoke insert, update, delete, truncate on public.shift_order_assignments from authenticated;

create or replace function public.unassigned_shift_order_window_start(
  target_restaurant_id uuid
)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $unassigned_window$
  select coalesce(
    (select max(closed_at) from public.business_days
     where restaurant_id = target_restaurant_id and status = 'closed'),
    (select opened_at - interval '24 hours' from public.business_days
     where restaurant_id = target_restaurant_id and status = 'open'),
    now() - interval '24 hours'
  );
$unassigned_window$;

create or replace function public.assign_unassigned_orders_to_open_shift(
  target_restaurant_id uuid,
  target_shift_id uuid,
  target_order_ids uuid[],
  event_actor_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $assign_unassigned$
declare
  actor_role text;
  shift_row public.restaurant_shifts%rowtype;
  requested_ids uuid[];
  window_start timestamptz;
  assigned_count integer;
begin
  select coalesce(array_agg(distinct id), '{}') into requested_ids
  from unnest(coalesce(target_order_ids, '{}'::uuid[])) as id
  where id is not null;
  if cardinality(requested_ids) = 0 then
    raise exception 'Choose at least one order to assign';
  end if;
  if cardinality(requested_ids) > 200 then
    raise exception 'Assign at most 200 orders at a time';
  end if;

  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);

  -- Same lock as close, so the shift cannot close while orders move into it.
  select * into shift_row from public.restaurant_shifts
  where id = target_shift_id and restaurant_id = target_restaurant_id
  for update;
  if shift_row.id is null or shift_row.status <> 'open' then
    raise exception 'Open shift not found';
  end if;
  if actor_role is null
     or (actor_role = 'staff' and shift_row.opened_by_user_id <> event_actor_user_id) then
    raise exception 'Only the shift opener or restaurant management can assign orders';
  end if;

  window_start := public.unassigned_shift_order_window_start(target_restaurant_id);

  -- Lock the requested orders and check every one is still eligible.
  perform 1 from public.orders
  where restaurant_id = target_restaurant_id and id = any(requested_ids)
  for update;

  if (
    select count(*) from public.orders
    where restaurant_id = target_restaurant_id
      and id = any(requested_ids)
      and status = 'Completed'
      and shift_id is null
      and coalesce(closed_at, created_at) >= window_start
  ) <> cardinality(requested_ids) then
    raise exception 'Some orders can no longer be assigned. Refresh and try again';
  end if;

  update public.orders set shift_id = target_shift_id
  where restaurant_id = target_restaurant_id and id = any(requested_ids)
    and status = 'Completed' and shift_id is null;
  get diagnostics assigned_count = row_count;

  insert into public.shift_order_assignments (
    restaurant_id, shift_id, order_id, assigned_by_user_id
  )
  select target_restaurant_id, target_shift_id, id, event_actor_user_id
  from unnest(requested_ids) as id;

  return assigned_count;
end;
$assign_unassigned$;

revoke all on function public.unassigned_shift_order_window_start(uuid)
from public, anon, authenticated;
grant execute on function public.unassigned_shift_order_window_start(uuid) to service_role;
revoke all on function public.assign_unassigned_orders_to_open_shift(uuid, uuid, uuid[], uuid)
from public, anon, authenticated;
grant execute on function public.assign_unassigned_orders_to_open_shift(uuid, uuid, uuid[], uuid)
to service_role;

comment on table public.shift_order_assignments is
  'Audit of completed orders manually assigned to an open shift after being completed while no shift was open.';

notify pgrst, 'reload schema';

commit;

-- Rollback: drop function public.assign_unassigned_orders_to_open_shift(uuid, uuid, uuid[], uuid);
-- drop function public.unassigned_shift_order_window_start(uuid);
-- drop table public.shift_order_assignments (export it first: it is the only
-- record of who assigned which orders). Assigned orders keep their shift_id.
