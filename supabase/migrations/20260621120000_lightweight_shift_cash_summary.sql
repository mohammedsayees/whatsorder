-- WhatsOrder lightweight Shift Cash Summary
-- Run after 20260620_p1_pilot_operations.sql and the P0 hardening migrations.
--
-- Scope: operational shift cash only. This deliberately excludes accounting,
-- VAT, inventory, payroll, supplier ledgers, drawer hardware, and settlement
-- reconciliation.

create table if not exists public.restaurant_shifts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  shift_name text not null check (char_length(trim(shift_name)) between 1 and 80),
  status text not null default 'open' check (status in ('open', 'closed')),
  opening_cash_amount numeric(10, 2) not null default 0
    check (opening_cash_amount >= 0),
  cash_counted_amount numeric(10, 2)
    check (cash_counted_amount is null or cash_counted_amount >= 0),
  completed_order_count integer not null default 0,
  completed_sales numeric(10, 2) not null default 0,
  completed_cash_order_total numeric(10, 2) not null default 0,
  card_on_delivery_total numeric(10, 2) not null default 0,
  cash_paid_out_total numeric(10, 2) not null default 0,
  cancelled_order_count integer not null default 0,
  fulfilment_breakdown jsonb not null default '{}'::jsonb,
  expected_cash_amount numeric(10, 2),
  difference_amount numeric(10, 2),
  opened_by_user_id uuid not null,
  closed_by_user_id uuid,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_note text,
  closing_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_shifts_closed_fields_check check (
    (status = 'open' and closed_at is null and closed_by_user_id is null)
    or
    (
      status = 'closed'
      and closed_at is not null
      and closed_by_user_id is not null
      and cash_counted_amount is not null
      and expected_cash_amount is not null
      and difference_amount is not null
    )
  ),
  constraint restaurant_shifts_id_restaurant_unique
    unique (id, restaurant_id)
);

create unique index if not exists idx_restaurant_shifts_one_open
on public.restaurant_shifts(restaurant_id)
where status = 'open';

create index if not exists idx_restaurant_shifts_restaurant_opened
on public.restaurant_shifts(restaurant_id, opened_at desc);

create table if not exists public.shift_cash_paid_outs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  shift_id uuid not null,
  amount numeric(10, 2) not null check (amount > 0),
  reason text not null check (char_length(trim(reason)) between 1 and 300),
  recorded_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint shift_cash_paid_outs_shift_tenant_fkey
    foreign key (shift_id, restaurant_id)
    references public.restaurant_shifts(id, restaurant_id)
    on delete restrict
);

create index if not exists idx_shift_cash_paid_outs_shift_recorded
on public.shift_cash_paid_outs(restaurant_id, shift_id, recorded_at);

alter table public.orders
add column if not exists shift_id uuid;

do $orders_shift_constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_shift_tenant_fkey'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_shift_tenant_fkey
      foreign key (shift_id, restaurant_id)
      references public.restaurant_shifts(id, restaurant_id)
      on delete restrict
      not valid;
  end if;
end;
$orders_shift_constraint$;

alter table public.orders
validate constraint orders_shift_tenant_fkey;

create index if not exists idx_orders_restaurant_shift
on public.orders(restaurant_id, shift_id);

create index if not exists idx_orders_unassigned_completed
on public.orders(restaurant_id, status)
where shift_id is null;

create index if not exists idx_order_status_events_restaurant_created
on public.order_status_events(restaurant_id, created_at desc);

drop trigger if exists restaurant_shifts_set_updated_at
on public.restaurant_shifts;
create trigger restaurant_shifts_set_updated_at
before update on public.restaurant_shifts
for each row execute function public.set_updated_at();

alter table public.restaurant_shifts enable row level security;
alter table public.shift_cash_paid_outs enable row level security;

drop policy if exists "Restaurant managers can read all shifts"
on public.restaurant_shifts;
create policy "Restaurant managers can read all shifts"
on public.restaurant_shifts for select
using (
  public.is_restaurant_member(
    restaurant_shifts.restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
);

drop policy if exists "Restaurant staff can read current and own shifts"
on public.restaurant_shifts;
create policy "Restaurant staff can read current and own shifts"
on public.restaurant_shifts for select
using (
  public.is_restaurant_member(
    restaurant_shifts.restaurant_id,
    array['staff']
  )
  and (
    restaurant_shifts.status = 'open'
    or restaurant_shifts.opened_by_user_id = auth.uid()
  )
);

drop policy if exists "Restaurant managers can read all shift paid outs"
on public.shift_cash_paid_outs;
create policy "Restaurant managers can read all shift paid outs"
on public.shift_cash_paid_outs for select
using (
  public.is_restaurant_member(
    shift_cash_paid_outs.restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
);

drop policy if exists "Restaurant staff can read current shift paid outs"
on public.shift_cash_paid_outs;
create policy "Restaurant staff can read current shift paid outs"
on public.shift_cash_paid_outs for select
using (
  public.is_restaurant_member(
    shift_cash_paid_outs.restaurant_id,
    array['staff']
  )
  and exists (
    select 1
    from public.restaurant_shifts shift
    where shift.id = shift_cash_paid_outs.shift_id
      and shift.restaurant_id = shift_cash_paid_outs.restaurant_id
      and (
        shift.status = 'open'
        or shift.opened_by_user_id = auth.uid()
      )
  )
);

revoke all on table public.restaurant_shifts from anon, authenticated;
revoke all on table public.shift_cash_paid_outs from anon, authenticated;
grant select on table public.restaurant_shifts to authenticated;
grant select on table public.shift_cash_paid_outs to authenticated;

create or replace function public.shift_actor_role(
  target_restaurant_id uuid,
  target_user_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $shift_actor_role$
  select role
  from public.restaurant_users
  where restaurant_id = target_restaurant_id
    and user_id = target_user_id
    and accepted_at is not null
    and role in ('restaurant_admin', 'owner', 'manager', 'staff')
  limit 1;
$shift_actor_role$;

create or replace function public.calculate_restaurant_shift_summary(
  target_restaurant_id uuid,
  target_shift_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $shift_summary$
  with target_shift as (
    select *
    from public.restaurant_shifts
    where id = target_shift_id
      and restaurant_id = target_restaurant_id
  ),
  completed as (
    select
      count(*)::integer as completed_order_count,
      coalesce(sum(total), 0)::numeric(10, 2) as completed_sales,
      coalesce(
        sum(total) filter (where payment_method = 'Cash on Delivery'),
        0
      )::numeric(10, 2) as completed_cash_order_total,
      coalesce(
        sum(total) filter (where payment_method = 'Card on Delivery'),
        0
      )::numeric(10, 2) as card_on_delivery_total
    from public.orders
    where restaurant_id = target_restaurant_id
      and shift_id = target_shift_id
      and status = 'Completed'
  ),
  paid_outs as (
    select coalesce(sum(amount), 0)::numeric(10, 2) as cash_paid_out_total
    from public.shift_cash_paid_outs
    where restaurant_id = target_restaurant_id
      and shift_id = target_shift_id
  ),
  fulfilment as (
    select coalesce(
      jsonb_object_agg(
        fulfilment_type,
        jsonb_build_object('orders', order_count, 'sales', sales)
      ),
      '{}'::jsonb
    ) as breakdown
    from (
      select
        fulfilment_type,
        count(*)::integer as order_count,
        sum(total)::numeric(10, 2) as sales
      from public.orders
      where restaurant_id = target_restaurant_id
        and shift_id = target_shift_id
        and status = 'Completed'
      group by fulfilment_type
    ) values_by_fulfilment
  ),
  cancelled as (
    select count(distinct event.order_id)::integer as cancelled_order_count
    from public.order_status_events event
    cross join target_shift shift
    where event.restaurant_id = target_restaurant_id
      and event.to_status = 'Cancelled'
      and event.created_at >= shift.opened_at
      and event.created_at <= coalesce(shift.closed_at, now())
  )
  select jsonb_build_object(
    'completed_order_count', completed.completed_order_count,
    'completed_sales', completed.completed_sales,
    'completed_cash_order_total', completed.completed_cash_order_total,
    'card_on_delivery_total', completed.card_on_delivery_total,
    'cash_paid_out_total', paid_outs.cash_paid_out_total,
    'cancelled_order_count', cancelled.cancelled_order_count,
    'fulfilment_breakdown', fulfilment.breakdown,
    'expected_cash_amount',
      (
        shift.opening_cash_amount
        + completed.completed_cash_order_total
        - paid_outs.cash_paid_out_total
      )::numeric(10, 2)
  )
  from target_shift shift
  cross join completed
  cross join paid_outs
  cross join fulfilment
  cross join cancelled;
$shift_summary$;

create or replace function public.open_restaurant_shift(
  target_restaurant_id uuid,
  requested_shift_name text,
  requested_opening_cash_amount numeric,
  requested_opening_note text,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $open_shift$
declare
  actor_role text;
  created_shift_id uuid;
begin
  actor_role := public.shift_actor_role(
    target_restaurant_id,
    event_actor_user_id
  );

  if actor_role is null then
    raise exception 'Shift access denied';
  end if;

  if nullif(trim(requested_shift_name), '') is null
     or char_length(trim(requested_shift_name)) > 80 then
    raise exception 'Shift name is required and must be 80 characters or fewer';
  end if;

  if requested_opening_cash_amount is null
     or requested_opening_cash_amount < 0 then
    raise exception 'Opening cash cannot be negative';
  end if;

  insert into public.restaurant_shifts (
    restaurant_id,
    shift_name,
    opening_cash_amount,
    opening_note,
    opened_by_user_id
  )
  values (
    target_restaurant_id,
    trim(requested_shift_name),
    round(requested_opening_cash_amount, 2),
    nullif(left(trim(requested_opening_note), 500), ''),
    event_actor_user_id
  )
  returning id into created_shift_id;

  return created_shift_id;
exception
  when unique_violation then
    raise exception 'This restaurant already has an open shift';
end;
$open_shift$;

create or replace function public.add_shift_cash_paid_out(
  target_restaurant_id uuid,
  target_shift_id uuid,
  requested_amount numeric,
  requested_reason text,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $add_paid_out$
declare
  actor_role text;
  shift_opener uuid;
  paid_out_id uuid;
begin
  actor_role := public.shift_actor_role(
    target_restaurant_id,
    event_actor_user_id
  );

  select opened_by_user_id
  into shift_opener
  from public.restaurant_shifts
  where id = target_shift_id
    and restaurant_id = target_restaurant_id
    and status = 'open'
  for update;

  if not found then
    raise exception 'Open shift not found';
  end if;

  if actor_role is null
     or (
       actor_role = 'staff'
       and shift_opener <> event_actor_user_id
     ) then
    raise exception 'Only the shift opener or restaurant management can add a paid-out';
  end if;

  if requested_amount is null or requested_amount <= 0 then
    raise exception 'Paid-out amount must be greater than zero';
  end if;

  if nullif(trim(requested_reason), '') is null
     or char_length(trim(requested_reason)) > 300 then
    raise exception 'A paid-out reason is required and must be 300 characters or fewer';
  end if;

  insert into public.shift_cash_paid_outs (
    restaurant_id,
    shift_id,
    amount,
    reason,
    recorded_by_user_id
  )
  values (
    target_restaurant_id,
    target_shift_id,
    round(requested_amount, 2),
    trim(requested_reason),
    event_actor_user_id
  )
  returning id into paid_out_id;

  return paid_out_id;
end;
$add_paid_out$;

create or replace function public.close_restaurant_shift(
  target_restaurant_id uuid,
  target_shift_id uuid,
  requested_cash_counted_amount numeric,
  requested_closing_note text,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $close_shift$
declare
  actor_role text;
  shift_opener uuid;
  summary jsonb;
  expected_cash numeric(10, 2);
  difference numeric(10, 2);
begin
  actor_role := public.shift_actor_role(
    target_restaurant_id,
    event_actor_user_id
  );

  select opened_by_user_id
  into shift_opener
  from public.restaurant_shifts
  where id = target_shift_id
    and restaurant_id = target_restaurant_id
    and status = 'open'
  for update;

  if not found then
    raise exception 'Open shift not found';
  end if;

  if actor_role is null
     or (
       actor_role = 'staff'
       and shift_opener <> event_actor_user_id
     ) then
    raise exception 'Only the shift opener or restaurant management can close this shift';
  end if;

  if requested_cash_counted_amount is null
     or requested_cash_counted_amount < 0 then
    raise exception 'Counted cash cannot be negative';
  end if;

  summary := public.calculate_restaurant_shift_summary(
    target_restaurant_id,
    target_shift_id
  );

  expected_cash := (summary->>'expected_cash_amount')::numeric(10, 2);
  difference := round(requested_cash_counted_amount, 2) - expected_cash;

  if difference <> 0
     and nullif(trim(requested_closing_note), '') is null then
    raise exception 'A closing note is required when cash has a difference';
  end if;

  update public.restaurant_shifts
  set
    status = 'closed',
    cash_counted_amount = round(requested_cash_counted_amount, 2),
    expected_cash_amount = expected_cash,
    difference_amount = difference,
    completed_order_count =
      (summary->>'completed_order_count')::integer,
    completed_sales = (summary->>'completed_sales')::numeric(10, 2),
    completed_cash_order_total =
      (summary->>'completed_cash_order_total')::numeric(10, 2),
    card_on_delivery_total =
      (summary->>'card_on_delivery_total')::numeric(10, 2),
    cash_paid_out_total =
      (summary->>'cash_paid_out_total')::numeric(10, 2),
    cancelled_order_count =
      (summary->>'cancelled_order_count')::integer,
    fulfilment_breakdown = summary->'fulfilment_breakdown',
    closing_note = nullif(left(trim(requested_closing_note), 500), ''),
    closed_by_user_id = event_actor_user_id,
    closed_at = now()
  where id = target_shift_id
    and restaurant_id = target_restaurant_id
    and status = 'open';

  return target_shift_id;
end;
$close_shift$;

create or replace function public.transition_order_status_and_record_event(
  target_restaurant_id uuid,
  target_order_id uuid,
  target_status text,
  event_actor_user_id uuid,
  event_actor_role text,
  event_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $transition_and_record$
declare
  previous_status public.order_status;
  updated_order_id uuid;
  active_shift_id uuid;
begin
  if target_status = 'Completed' then
    select id
    into active_shift_id
    from public.restaurant_shifts
    where restaurant_id = target_restaurant_id
      and status = 'open'
    for update;
  end if;

  select status
  into previous_status
  from public.orders
  where id = target_order_id
    and restaurant_id = target_restaurant_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  updated_order_id := public.transition_order_status_and_award_loyalty(
    target_restaurant_id,
    target_order_id,
    target_status
  );

  if target_status = 'Completed' and active_shift_id is not null then
    update public.orders
    set shift_id = active_shift_id
    where id = target_order_id
      and restaurant_id = target_restaurant_id
      and shift_id is null;
  end if;

  insert into public.order_status_events (
    restaurant_id,
    order_id,
    from_status,
    to_status,
    actor_user_id,
    actor_role,
    reason
  )
  values (
    target_restaurant_id,
    target_order_id,
    previous_status,
    target_status::public.order_status,
    event_actor_user_id,
    nullif(trim(event_actor_role), ''),
    nullif(trim(event_reason), '')
  );

  return updated_order_id;
end;
$transition_and_record$;

revoke all on function public.shift_actor_role(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.calculate_restaurant_shift_summary(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.open_restaurant_shift(
  uuid, text, numeric, text, uuid
) from public, anon, authenticated;
revoke all on function public.add_shift_cash_paid_out(
  uuid, uuid, numeric, text, uuid
) from public, anon, authenticated;
revoke all on function public.close_restaurant_shift(
  uuid, uuid, numeric, text, uuid
) from public, anon, authenticated;
revoke all on function public.transition_order_status_and_record_event(
  uuid, uuid, text, uuid, text, text
) from public, anon, authenticated;

grant execute on function public.calculate_restaurant_shift_summary(uuid, uuid)
to service_role;
grant execute on function public.open_restaurant_shift(
  uuid, text, numeric, text, uuid
) to service_role;
grant execute on function public.add_shift_cash_paid_out(
  uuid, uuid, numeric, text, uuid
) to service_role;
grant execute on function public.close_restaurant_shift(
  uuid, uuid, numeric, text, uuid
) to service_role;
grant execute on function public.transition_order_status_and_record_event(
  uuid, uuid, text, uuid, text, text
) to service_role;

notify pgrst, 'reload schema';
