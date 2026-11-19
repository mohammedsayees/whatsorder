-- Blind cash count at shift close.
--
-- Staff could see expected cash (and a live over/short preview) while counting
-- the drawer, so a count could be "made to match". With blind counting on:
--
-- 1. restaurants.blind_cash_count (default true, so on for every restaurant):
--    staff close a shift in two steps. Managers/owners are not blinded.
-- 2. declare_shift_cash_count: the shift opener or management locks the
--    counted cash on the open shift. It is stored once and cannot be changed
--    while the shift is open; a wrong count is fixed after close through the
--    existing, versioned report correction. Refused while active orders remain
--    (they could still add cash).
-- 3. close_restaurant_shift_v4 wraps close_restaurant_shift_v3 unchanged:
--    - if a count was locked, the close must use exactly that amount (anyone);
--    - if none was locked, a staff member of a blind-count restaurant is refused.
--    Management closing without a locked count behaves exactly as before.
--
-- No existing function, policy or financial row is changed.

begin;
set local lock_timeout = '5s';

alter table public.restaurants
  add column if not exists blind_cash_count boolean not null default true;

alter table public.restaurant_shifts
  add column if not exists declared_cash_counted_amount numeric(10, 2),
  add column if not exists cash_count_declared_at timestamptz,
  add column if not exists cash_count_declared_by_user_id uuid;

alter table public.restaurant_shifts
  drop constraint if exists restaurant_shifts_declared_cash_count_check;
alter table public.restaurant_shifts
  add constraint restaurant_shifts_declared_cash_count_check check (
    (declared_cash_counted_amount is null and cash_count_declared_at is null
      and cash_count_declared_by_user_id is null)
    or
    (declared_cash_counted_amount is not null and declared_cash_counted_amount >= 0
      and cash_count_declared_at is not null and cash_count_declared_by_user_id is not null)
  );

create or replace function public.declare_shift_cash_count(
  target_restaurant_id uuid,
  target_shift_id uuid,
  requested_cash_counted_amount numeric,
  event_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $declare_cash_count$
declare
  actor_role text;
  shift_row public.restaurant_shifts%rowtype;
begin
  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);

  -- Same lock as close.
  select * into shift_row from public.restaurant_shifts
  where id = target_shift_id and restaurant_id = target_restaurant_id
  for update;
  if shift_row.id is null or shift_row.status <> 'open' then
    raise exception 'Open shift not found';
  end if;
  if actor_role is null
     or (actor_role = 'staff' and shift_row.opened_by_user_id <> event_actor_user_id) then
    raise exception 'Only the shift opener or restaurant management can close this shift';
  end if;
  if shift_row.cash_count_declared_at is not null then
    raise exception 'The cash count for this shift is already locked';
  end if;
  if requested_cash_counted_amount is null or requested_cash_counted_amount < 0
     or requested_cash_counted_amount > 99999999.99 then
    raise exception 'Counted cash cannot be negative';
  end if;
  if exists (
    select 1 from public.orders
    where restaurant_id = target_restaurant_id
      and status in ('New', 'Accepted', 'Preparing', 'Ready to Serve', 'Out for Delivery')
  ) then
    raise exception 'Cannot close shift while active orders remain';
  end if;

  update public.restaurant_shifts set
    declared_cash_counted_amount = round(requested_cash_counted_amount, 2),
    cash_count_declared_at = now(),
    cash_count_declared_by_user_id = event_actor_user_id
  where id = target_shift_id and restaurant_id = target_restaurant_id;
end;
$declare_cash_count$;

create or replace function public.close_restaurant_shift_v4(
  target_restaurant_id uuid,
  target_shift_id uuid,
  requested_cash_counted_amount numeric,
  requested_card_terminal_total numeric,
  requested_upi_reported_total numeric,
  requested_marketplace_sales jsonb,
  requested_closing_note text,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $close_shift_v4$
declare
  actor_role text;
  shift_row public.restaurant_shifts%rowtype;
  blind boolean;
begin
  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);

  select * into shift_row from public.restaurant_shifts
  where id = target_shift_id and restaurant_id = target_restaurant_id and status = 'open'
  for update;

  if shift_row.id is not null then
    if shift_row.cash_count_declared_at is not null then
      if requested_cash_counted_amount is null
         or round(requested_cash_counted_amount, 2) <> shift_row.declared_cash_counted_amount then
        raise exception 'Close with the locked cash count';
      end if;
    else
      select coalesce(blind_cash_count, true) into blind
      from public.restaurants where id = target_restaurant_id;
      if blind and actor_role = 'staff' then
        raise exception 'Lock the cash count before closing';
      end if;
    end if;
  end if;

  -- Unchanged close; it re-checks the shift, role, totals and notes.
  return public.close_restaurant_shift_v3(
    target_restaurant_id, target_shift_id, requested_cash_counted_amount,
    requested_card_terminal_total, requested_upi_reported_total,
    requested_marketplace_sales, requested_closing_note, event_actor_user_id
  );
end;
$close_shift_v4$;

revoke all on function public.declare_shift_cash_count(uuid, uuid, numeric, uuid)
from public, anon, authenticated;
grant execute on function public.declare_shift_cash_count(uuid, uuid, numeric, uuid) to service_role;
revoke all on function public.close_restaurant_shift_v4(uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid)
from public, anon, authenticated;
grant execute on function public.close_restaurant_shift_v4(uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid)
to service_role;

comment on column public.restaurants.blind_cash_count is
  'When true, staff must lock their counted cash before they can see expected cash and close a shift.';
comment on column public.restaurant_shifts.declared_cash_counted_amount is
  'Counted cash locked before close (blind count). The close must use exactly this amount.';

notify pgrst, 'reload schema';

commit;

-- Rollback: point the app back at close_restaurant_shift_v3 first, then
-- drop function public.close_restaurant_shift_v4(uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid);
-- drop function public.declare_shift_cash_count(uuid, uuid, numeric, uuid);
-- and drop the constraint and the four columns. Locked counts on closed shifts
-- are also in the close report, so nothing financial is lost.
