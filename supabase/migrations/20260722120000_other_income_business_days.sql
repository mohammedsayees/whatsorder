-- Other income and operational business-day close reports.
-- Sales remain order-derived. Other income is reported separately, while cash
-- income participates in drawer reconciliation. Business days are explicitly
-- opened/closed and therefore may span local midnight.

create table if not exists public.business_days (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  business_date date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_by_user_id uuid not null,
  closed_by_user_id uuid,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  close_report_snapshot jsonb,
  close_report_generated_at timestamptz,
  close_report_version integer not null default 0 check (close_report_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_days_id_restaurant_unique unique (id, restaurant_id),
  constraint business_days_restaurant_date_unique unique (restaurant_id, business_date),
  constraint business_days_closed_fields_check check (
    (status = 'open' and closed_at is null and closed_by_user_id is null)
    or
    (status = 'closed' and closed_at is not null and closed_by_user_id is not null
      and close_report_snapshot is not null and close_report_version > 0)
  )
);

create unique index if not exists idx_business_days_one_open
on public.business_days(restaurant_id) where status = 'open';

create index if not exists idx_business_days_restaurant_date
on public.business_days(restaurant_id, business_date desc);

alter table public.restaurant_shifts
  add column if not exists business_day_id uuid,
  add column if not exists other_income_total numeric(10, 2) not null default 0,
  add column if not exists cash_other_income_total numeric(10, 2) not null default 0,
  add column if not exists card_other_income_total numeric(10, 2) not null default 0,
  add column if not exists upi_other_income_total numeric(10, 2) not null default 0,
  add column if not exists bank_other_income_total numeric(10, 2) not null default 0,
  add column if not exists other_income_breakdown jsonb not null default '{}'::jsonb;

do $business_day_shift_constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurant_shifts_business_day_tenant_fkey'
      and conrelid = 'public.restaurant_shifts'::regclass
  ) then
    alter table public.restaurant_shifts
      add constraint restaurant_shifts_business_day_tenant_fkey
      foreign key (business_day_id, restaurant_id)
      references public.business_days(id, restaurant_id)
      on delete restrict;
  end if;
end;
$business_day_shift_constraint$;

create index if not exists idx_restaurant_shifts_business_day
on public.restaurant_shifts(restaurant_id, business_day_id, opened_at);

create table if not exists public.shift_other_income_entries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  shift_id uuid not null,
  category text not null check (
    category in ('used_oil_sale', 'scrap_sale', 'supplier_rebate', 'rental_income', 'other')
  ),
  amount numeric(10, 2) not null check (amount > 0),
  payment_method text not null check (
    payment_method in ('cash', 'card', 'upi', 'bank_transfer', 'other')
  ),
  description text not null check (char_length(trim(description)) between 1 and 300),
  reference text check (reference is null or char_length(trim(reference)) between 1 and 120),
  recorded_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by_user_id uuid,
  void_reason text check (
    void_reason is null or char_length(trim(void_reason)) between 1 and 300
  ),
  constraint shift_other_income_shift_tenant_fkey
    foreign key (shift_id, restaurant_id)
    references public.restaurant_shifts(id, restaurant_id)
    on delete restrict,
  constraint shift_other_income_void_check check (
    (voided_at is null and voided_by_user_id is null and void_reason is null)
    or
    (voided_at is not null and voided_by_user_id is not null and void_reason is not null)
  )
);

create index if not exists idx_shift_other_income_shift_recorded
on public.shift_other_income_entries(restaurant_id, shift_id, recorded_at);

create table if not exists public.business_day_close_reports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  business_day_id uuid not null,
  version integer not null check (version > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  constraint business_day_reports_day_tenant_fkey
    foreign key (business_day_id, restaurant_id)
    references public.business_days(id, restaurant_id)
    on delete restrict,
  constraint business_day_reports_version_unique unique (business_day_id, version)
);

create index if not exists idx_business_day_reports_day_version
on public.business_day_close_reports(restaurant_id, business_day_id, version desc);

drop trigger if exists business_days_set_updated_at on public.business_days;
create trigger business_days_set_updated_at
before update on public.business_days
for each row execute function public.set_updated_at();

alter table public.business_days enable row level security;
alter table public.shift_other_income_entries enable row level security;
alter table public.business_day_close_reports enable row level security;

create policy "Restaurant management can read own business days"
on public.business_days for select
using (public.is_restaurant_member(
  business_days.restaurant_id,
  array['restaurant_admin', 'owner', 'manager']
));

create policy "Restaurant management can read own other income"
on public.shift_other_income_entries for select
using (public.is_restaurant_member(
  shift_other_income_entries.restaurant_id,
  array['restaurant_admin', 'owner', 'manager']
));

create policy "Restaurant staff can read current and own other income"
on public.shift_other_income_entries for select
using (
  public.is_restaurant_member(
    shift_other_income_entries.restaurant_id,
    array['staff']
  )
  and exists (
    select 1 from public.restaurant_shifts shift
    where shift.id = shift_other_income_entries.shift_id
      and shift.restaurant_id = shift_other_income_entries.restaurant_id
      and (shift.status = 'open' or shift.opened_by_user_id = auth.uid())
  )
);

create policy "Restaurant management can read own business day reports"
on public.business_day_close_reports for select
using (public.is_restaurant_member(
  business_day_close_reports.restaurant_id,
  array['restaurant_admin', 'owner', 'manager']
));

revoke all on table public.business_days from anon, authenticated;
revoke all on table public.shift_other_income_entries from anon, authenticated;
revoke all on table public.business_day_close_reports from anon, authenticated;
grant select on table public.business_days to authenticated;
grant select on table public.shift_other_income_entries to authenticated;
grant select on table public.business_day_close_reports to authenticated;

-- Existing open shifts are adopted into a new open business day. Historical
-- shifts remain legacy/unassigned rather than inventing close reports.
do $adopt_open_shifts$
declare
  open_shift record;
  created_day_id uuid;
begin
  for open_shift in
    select shift.id, shift.restaurant_id, shift.opened_by_user_id,
      (shift.opened_at at time zone restaurant.time_zone)::date as business_date
    from public.restaurant_shifts shift
    join public.restaurants restaurant on restaurant.id = shift.restaurant_id
    where shift.status = 'open' and shift.business_day_id is null
  loop
    insert into public.business_days (
      restaurant_id, business_date, opened_by_user_id, opened_at
    ) values (
      open_shift.restaurant_id, open_shift.business_date,
      open_shift.opened_by_user_id, now()
    )
    on conflict (restaurant_id, business_date) do update
      set updated_at = now()
    returning id into created_day_id;

    update public.restaurant_shifts
    set business_day_id = created_day_id
    where id = open_shift.id and restaurant_id = open_shift.restaurant_id;
  end loop;
end;
$adopt_open_shifts$;

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
    select * from public.restaurant_shifts
    where id = target_shift_id and restaurant_id = target_restaurant_id
  ),
  completed as (
    select
      count(*)::integer as completed_order_count,
      coalesce(sum(total), 0)::numeric(10, 2) as completed_sales,
      coalesce(sum(total) filter (where payment_method = 'Cash on Delivery'), 0)::numeric(10, 2)
        as completed_cash_order_total,
      coalesce(sum(total) filter (where payment_method = 'Card on Delivery'), 0)::numeric(10, 2)
        as completed_card_order_total,
      coalesce(sum(total) filter (where payment_method = 'UPI'), 0)::numeric(10, 2)
        as completed_upi_order_total
    from public.orders
    where restaurant_id = target_restaurant_id
      and shift_id = target_shift_id and status = 'Completed'
  ),
  paid_outs as (
    select coalesce(sum(amount), 0)::numeric(10, 2) as cash_paid_out_total
    from public.shift_cash_paid_outs
    where restaurant_id = target_restaurant_id and shift_id = target_shift_id
  ),
  other_income as (
    select
      coalesce(sum(amount), 0)::numeric(10, 2) as total,
      coalesce(sum(amount) filter (where payment_method = 'cash'), 0)::numeric(10, 2) as cash_total,
      coalesce(sum(amount) filter (where payment_method = 'card'), 0)::numeric(10, 2) as card_total,
      coalesce(sum(amount) filter (where payment_method = 'upi'), 0)::numeric(10, 2) as upi_total,
      coalesce(sum(amount) filter (where payment_method = 'bank_transfer'), 0)::numeric(10, 2) as bank_total
    from public.shift_other_income_entries
    where restaurant_id = target_restaurant_id
      and shift_id = target_shift_id and voided_at is null
  ),
  other_breakdown as (
    select coalesce(jsonb_object_agg(category, amount), '{}'::jsonb) as breakdown
    from (
      select category, sum(amount)::numeric(10, 2) as amount
      from public.shift_other_income_entries
      where restaurant_id = target_restaurant_id
        and shift_id = target_shift_id and voided_at is null
      group by category
    ) values_by_category
  ),
  fulfilment as (
    select coalesce(jsonb_object_agg(
      fulfilment_type, jsonb_build_object('orders', order_count, 'sales', sales)
    ), '{}'::jsonb) as breakdown
    from (
      select fulfilment_type, count(*)::integer as order_count,
        sum(total)::numeric(10, 2) as sales
      from public.orders
      where restaurant_id = target_restaurant_id
        and shift_id = target_shift_id and status = 'Completed'
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
    'completed_card_order_total', completed.completed_card_order_total,
    'completed_upi_order_total', completed.completed_upi_order_total,
    -- Compatibility keys are the expected reconciled receipts for the method.
    'card_on_delivery_total', completed.completed_card_order_total + other_income.card_total,
    'upi_total', completed.completed_upi_order_total + other_income.upi_total,
    'cash_paid_out_total', paid_outs.cash_paid_out_total,
    'other_income_total', other_income.total,
    'cash_other_income_total', other_income.cash_total,
    'card_other_income_total', other_income.card_total,
    'upi_other_income_total', other_income.upi_total,
    'bank_other_income_total', other_income.bank_total,
    'other_income_breakdown', other_breakdown.breakdown,
    'cancelled_order_count', cancelled.cancelled_order_count,
    'fulfilment_breakdown', fulfilment.breakdown,
    'expected_cash_amount', (
      shift.opening_cash_amount + completed.completed_cash_order_total
      + other_income.cash_total - paid_outs.cash_paid_out_total
    )::numeric(10, 2)
  )
  from target_shift shift
  cross join completed cross join paid_outs cross join other_income
  cross join other_breakdown cross join fulfilment cross join cancelled;
$shift_summary$;

create or replace function public.open_restaurant_shift_v2(
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
as $open_shift_v2$
declare
  created_shift_id uuid;
  active_day_id uuid;
  local_business_date date;
begin
  created_shift_id := public.open_restaurant_shift(
    target_restaurant_id, requested_shift_name, requested_opening_cash_amount,
    requested_opening_note, event_actor_user_id
  );

  select id into active_day_id from public.business_days
  where restaurant_id = target_restaurant_id and status = 'open'
  for update;

  if active_day_id is null then
    select (now() at time zone time_zone)::date into local_business_date
    from public.restaurants where id = target_restaurant_id;

    insert into public.business_days (
      restaurant_id, business_date, opened_by_user_id
    ) values (
      target_restaurant_id, local_business_date, event_actor_user_id
    ) returning id into active_day_id;
  end if;

  update public.restaurant_shifts set business_day_id = active_day_id
  where id = created_shift_id and restaurant_id = target_restaurant_id;

  return created_shift_id;
exception
  when unique_violation then
    raise exception 'This restaurant already has an open shift or business day';
end;
$open_shift_v2$;

create or replace function public.add_shift_other_income(
  target_restaurant_id uuid,
  target_shift_id uuid,
  requested_category text,
  requested_amount numeric,
  requested_payment_method text,
  requested_description text,
  requested_reference text,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $add_other_income$
declare
  actor_role text;
  shift_opener uuid;
  entry_id uuid;
begin
  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);
  select opened_by_user_id into shift_opener
  from public.restaurant_shifts
  where id = target_shift_id and restaurant_id = target_restaurant_id and status = 'open'
  for update;

  if not found then raise exception 'Open shift not found'; end if;
  if actor_role is null or (actor_role = 'staff' and shift_opener <> event_actor_user_id) then
    raise exception 'Only the shift opener or restaurant management can add other income';
  end if;
  if requested_category not in ('used_oil_sale', 'scrap_sale', 'supplier_rebate', 'rental_income', 'other') then
    raise exception 'Choose a valid other income category';
  end if;
  if requested_payment_method not in ('cash', 'card', 'upi', 'bank_transfer', 'other') then
    raise exception 'Choose a valid other income payment method';
  end if;
  if requested_amount is null or requested_amount <= 0 then
    raise exception 'Other income amount must be greater than zero';
  end if;
  if nullif(trim(requested_description), '') is null
     or char_length(trim(requested_description)) > 300 then
    raise exception 'An other income description is required';
  end if;

  insert into public.shift_other_income_entries (
    restaurant_id, shift_id, category, amount, payment_method,
    description, reference, recorded_by_user_id
  ) values (
    target_restaurant_id, target_shift_id, requested_category,
    round(requested_amount, 2), requested_payment_method,
    trim(requested_description), nullif(left(trim(requested_reference), 120), ''),
    event_actor_user_id
  ) returning id into entry_id;
  return entry_id;
end;
$add_other_income$;

create or replace function public.void_shift_other_income(
  target_restaurant_id uuid,
  target_shift_id uuid,
  target_entry_id uuid,
  requested_reason text,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $void_other_income$
declare
  actor_role text;
  shift_opener uuid;
begin
  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);
  select opened_by_user_id into shift_opener
  from public.restaurant_shifts
  where id = target_shift_id and restaurant_id = target_restaurant_id and status = 'open'
  for update;
  if not found then raise exception 'Other income can be voided only before shift close'; end if;
  if actor_role is null or (actor_role = 'staff' and shift_opener <> event_actor_user_id) then
    raise exception 'Only the shift opener or restaurant management can void other income';
  end if;
  if nullif(trim(requested_reason), '') is null
     or char_length(trim(requested_reason)) > 300 then
    raise exception 'A void reason is required';
  end if;

  update public.shift_other_income_entries set
    voided_at = now(), voided_by_user_id = event_actor_user_id,
    void_reason = trim(requested_reason)
  where id = target_entry_id and restaurant_id = target_restaurant_id
    and shift_id = target_shift_id and voided_at is null;
  if not found then raise exception 'Other income entry not found'; end if;
  return target_entry_id;
end;
$void_other_income$;

-- The existing close routine remains responsible for all shift locking and
-- reconciliation. This wrapper adds the new immutable other-income facts.
create or replace function public.close_restaurant_shift_v3(
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
as $close_shift_v3$
declare
  closed_shift_id uuid;
  summary jsonb;
  patched_snapshot jsonb;
begin
  closed_shift_id := public.close_restaurant_shift_v2(
    target_restaurant_id, target_shift_id, requested_cash_counted_amount,
    requested_card_terminal_total, requested_upi_reported_total,
    requested_marketplace_sales, requested_closing_note, event_actor_user_id
  );
  summary := public.calculate_restaurant_shift_summary(target_restaurant_id, target_shift_id);

  update public.restaurant_shifts
  set other_income_total = (summary->>'other_income_total')::numeric,
      cash_other_income_total = (summary->>'cash_other_income_total')::numeric,
      card_other_income_total = (summary->>'card_other_income_total')::numeric,
      upi_other_income_total = (summary->>'upi_other_income_total')::numeric,
      bank_other_income_total = (summary->>'bank_other_income_total')::numeric,
      other_income_breakdown = summary->'other_income_breakdown',
      close_report_snapshot = close_report_snapshot || jsonb_build_object(
        'other_income_total', (summary->>'other_income_total')::numeric,
        'cash_other_income_total', (summary->>'cash_other_income_total')::numeric,
        'card_other_income_total', (summary->>'card_other_income_total')::numeric,
        'upi_other_income_total', (summary->>'upi_other_income_total')::numeric,
        'bank_other_income_total', (summary->>'bank_other_income_total')::numeric,
        'other_income_breakdown', summary->'other_income_breakdown',
        'combined_operational_receipts',
          combined_operational_sales + (summary->>'other_income_total')::numeric
      )
  where id = target_shift_id and restaurant_id = target_restaurant_id
  returning close_report_snapshot into patched_snapshot;

  update public.shift_close_reports set snapshot = patched_snapshot
  where restaurant_id = target_restaurant_id and shift_id = target_shift_id and version = 1;
  return closed_shift_id;
end;
$close_shift_v3$;

create or replace function public.revise_restaurant_shift_close_report_v2(
  target_restaurant_id uuid,
  target_shift_id uuid,
  requested_cash_counted_amount numeric,
  requested_card_terminal_total numeric,
  requested_upi_reported_total numeric,
  requested_marketplace_sales jsonb,
  requested_correction_reason text,
  event_actor_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $revise_shift_v2$
declare
  next_version integer;
  patched_snapshot jsonb;
begin
  if exists (
    select 1
    from public.restaurant_shifts shift
    join public.business_days day on day.id = shift.business_day_id
      and day.restaurant_id = shift.restaurant_id
    where shift.id = target_shift_id
      and shift.restaurant_id = target_restaurant_id
      and day.status = 'closed'
  ) then
    raise exception 'A shift in a closed business day cannot be corrected';
  end if;

  next_version := public.revise_restaurant_shift_close_report(
    target_restaurant_id, target_shift_id, requested_cash_counted_amount,
    requested_card_terminal_total, requested_upi_reported_total,
    requested_marketplace_sales, requested_correction_reason, event_actor_user_id
  );

  update public.restaurant_shifts
  set close_report_snapshot = close_report_snapshot || jsonb_build_object(
    'other_income_total', other_income_total,
    'cash_other_income_total', cash_other_income_total,
    'card_other_income_total', card_other_income_total,
    'upi_other_income_total', upi_other_income_total,
    'bank_other_income_total', bank_other_income_total,
    'other_income_breakdown', other_income_breakdown,
    'combined_operational_receipts', combined_operational_sales + other_income_total
  )
  where id = target_shift_id and restaurant_id = target_restaurant_id
  returning close_report_snapshot into patched_snapshot;

  update public.shift_close_reports set snapshot = patched_snapshot
  where restaurant_id = target_restaurant_id and shift_id = target_shift_id
    and version = next_version;
  return next_version;
end;
$revise_shift_v2$;

create or replace function public.close_business_day(
  target_restaurant_id uuid,
  target_business_day_id uuid,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $close_business_day$
declare
  actor_role text;
  target_day public.business_days%rowtype;
  tenant public.restaurants%rowtype;
  snapshot jsonb;
  closed_timestamp timestamptz := now();
  shift_count integer;
begin
  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);
  if actor_role is null or actor_role not in ('restaurant_admin', 'owner', 'manager') then
    raise exception 'Only restaurant management can close a business day';
  end if;

  select * into target_day from public.business_days
  where id = target_business_day_id and restaurant_id = target_restaurant_id
    and status = 'open' for update;
  if not found then raise exception 'Open business day not found'; end if;

  select * into tenant from public.restaurants where id = target_restaurant_id;

  if exists (
    select 1 from public.restaurant_shifts
    where restaurant_id = target_restaurant_id
      and business_day_id = target_business_day_id and status = 'open'
  ) then raise exception 'Close every shift before closing the business day'; end if;

  select count(*) into shift_count from public.restaurant_shifts
  where restaurant_id = target_restaurant_id and business_day_id = target_business_day_id;
  if shift_count = 0 then raise exception 'The business day has no shifts'; end if;

  if exists (
    select 1 from public.orders
    where restaurant_id = target_restaurant_id
      and status in ('New', 'Accepted', 'Preparing', 'Ready to Serve', 'Out for Delivery')
  ) then raise exception 'Cannot close the business day while active orders remain'; end if;

  if exists (
    select 1 from public.orders
    where restaurant_id = target_restaurant_id and status = 'Completed'
      and shift_id is null and created_at >= target_day.opened_at
  ) then raise exception 'Assign completed orders before closing the business day'; end if;

  select jsonb_build_object(
    'schema_version', 1,
    'report_version', 1,
    'business_day_id', target_business_day_id,
    'business_date', target_day.business_date,
    'restaurant_id', target_restaurant_id,
    'restaurant_name', tenant.name,
    'country_code', tenant.country_code,
    'currency_code', tenant.currency_code,
    'time_zone', tenant.time_zone,
    'opened_at', min(shift.opened_at),
    'closed_at', max(shift.closed_at),
    'report_generated_at', closed_timestamp,
    'shift_count', count(*)::integer,
    'completed_order_count', coalesce(sum(shift.completed_order_count), 0),
    'cancelled_order_count', coalesce(sum(shift.cancelled_order_count), 0),
    'whatsorder_sales', coalesce(sum(shift.completed_sales), 0),
    'marketplace_sales', coalesce(sum(shift.marketplace_sales_total), 0),
    'combined_operational_sales', coalesce(sum(shift.combined_operational_sales), 0),
    'other_income_total', coalesce(sum(shift.other_income_total), 0),
    'cash_other_income_total', coalesce(sum(shift.cash_other_income_total), 0),
    'card_other_income_total', coalesce(sum(shift.card_other_income_total), 0),
    'upi_other_income_total', coalesce(sum(shift.upi_other_income_total), 0),
    'bank_other_income_total', coalesce(sum(shift.bank_other_income_total), 0),
    'total_operational_receipts',
      coalesce(sum(shift.combined_operational_sales + shift.other_income_total), 0),
    'cash_order_sales', coalesce(sum(shift.completed_cash_order_total), 0),
    'card_order_sales', coalesce(sum(shift.card_on_delivery_total - shift.card_other_income_total), 0),
    'upi_order_sales', coalesce(sum(shift.upi_total - shift.upi_other_income_total), 0),
    'cash_paid_out_total', coalesce(sum(shift.cash_paid_out_total), 0),
    'net_cash_movement', coalesce(sum(
      shift.completed_cash_order_total + shift.cash_other_income_total - shift.cash_paid_out_total
    ), 0),
    'cash_difference_total', coalesce(sum(shift.difference_amount), 0),
    'card_difference_total', coalesce(sum(shift.card_difference_amount), 0),
    'upi_difference_total', coalesce(sum(shift.upi_difference_amount), 0),
    'final_cash_counted', (array_agg(shift.cash_counted_amount order by shift.closed_at desc))[1],
    'shifts', jsonb_agg(jsonb_build_object(
      'id', shift.id,
      'name', shift.shift_name,
      'opened_at', shift.opened_at,
      'closed_at', shift.closed_at,
      'completed_orders', shift.completed_order_count,
      'sales', shift.completed_sales,
      'marketplace_sales', shift.marketplace_sales_total,
      'other_income', shift.other_income_total,
      'cash_paid_outs', shift.cash_paid_out_total,
      'opening_cash', shift.opening_cash_amount,
      'expected_cash', shift.expected_cash_amount,
      'cash_counted', shift.cash_counted_amount,
      'cash_difference', shift.difference_amount,
      'report_version', shift.close_report_version
    ) order by shift.opened_at),
    'other_income_breakdown', coalesce((
      select jsonb_object_agg(category, total)
      from (
        select entry.category, sum(entry.amount)::numeric(10, 2) as total
        from public.shift_other_income_entries entry
        join public.restaurant_shifts income_shift on income_shift.id = entry.shift_id
          and income_shift.restaurant_id = entry.restaurant_id
        where entry.restaurant_id = target_restaurant_id
          and income_shift.business_day_id = target_business_day_id
          and entry.voided_at is null
        group by entry.category
      ) categories
    ), '{}'::jsonb)
  ) into snapshot
  from public.restaurant_shifts shift
  where shift.restaurant_id = target_restaurant_id
    and shift.business_day_id = target_business_day_id and shift.status = 'closed';

  update public.business_days set
    status = 'closed', closed_by_user_id = event_actor_user_id,
    closed_at = closed_timestamp, close_report_snapshot = snapshot,
    close_report_generated_at = closed_timestamp, close_report_version = 1
  where id = target_business_day_id and restaurant_id = target_restaurant_id;

  insert into public.business_day_close_reports (
    restaurant_id, business_day_id, version, snapshot, created_by_user_id
  ) values (
    target_restaurant_id, target_business_day_id, 1, snapshot, event_actor_user_id
  );
  return target_business_day_id;
end;
$close_business_day$;

revoke all on function public.open_restaurant_shift_v2(uuid, text, numeric, text, uuid)
from public, anon, authenticated;
revoke all on function public.add_shift_other_income(uuid, uuid, text, numeric, text, text, text, uuid)
from public, anon, authenticated;
revoke all on function public.void_shift_other_income(uuid, uuid, uuid, text, uuid)
from public, anon, authenticated;
revoke all on function public.close_restaurant_shift_v3(uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid)
from public, anon, authenticated;
revoke all on function public.revise_restaurant_shift_close_report_v2(uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid)
from public, anon, authenticated;
revoke all on function public.close_business_day(uuid, uuid, uuid)
from public, anon, authenticated;

grant execute on function public.open_restaurant_shift_v2(uuid, text, numeric, text, uuid) to service_role;
grant execute on function public.add_shift_other_income(uuid, uuid, text, numeric, text, text, text, uuid) to service_role;
grant execute on function public.void_shift_other_income(uuid, uuid, uuid, text, uuid) to service_role;
grant execute on function public.close_restaurant_shift_v3(uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid) to service_role;
grant execute on function public.revise_restaurant_shift_close_report_v2(uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid) to service_role;
grant execute on function public.close_business_day(uuid, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
