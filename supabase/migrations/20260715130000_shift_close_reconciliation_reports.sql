-- Shift-close reconciliation and immutable operational reports.
-- This remains a lightweight operational check, not an accounting or
-- aggregator-settlement ledger. All writes stay behind service-role RPCs.

create or replace function public.valid_shift_marketplace_channels(channels text[])
returns boolean
language sql
immutable
set search_path = public
as $valid_channels$
  select
    channels is not null
    and channels <@ array['talabat', 'noon', 'smiles', 'keeta', 'deliveroo']::text[]
    and cardinality(channels) = (
      select count(distinct channel)
      from unnest(channels) as channel
    );
$valid_channels$;

alter table public.restaurants
  add column if not exists shift_marketplace_channels text[]
    not null default '{}'::text[];

update public.restaurants
set shift_marketplace_channels =
  array['talabat', 'noon', 'smiles', 'keeta', 'deliveroo']::text[]
where country_code = 'AE'
  and shift_marketplace_channels = '{}'::text[];

alter table public.restaurants
  drop constraint if exists restaurants_shift_marketplace_channels_check;
alter table public.restaurants
  add constraint restaurants_shift_marketplace_channels_check
  check (public.valid_shift_marketplace_channels(shift_marketplace_channels));

alter table public.restaurant_shifts
  add column if not exists card_terminal_total numeric(10, 2),
  add column if not exists card_difference_amount numeric(10, 2),
  add column if not exists upi_reported_total numeric(10, 2),
  add column if not exists upi_difference_amount numeric(10, 2),
  add column if not exists marketplace_sales jsonb not null default '[]'::jsonb,
  add column if not exists marketplace_sales_total numeric(10, 2) not null default 0,
  add column if not exists combined_operational_sales numeric(10, 2) not null default 0,
  add column if not exists close_report_snapshot jsonb,
  add column if not exists close_report_generated_at timestamptz,
  add column if not exists close_report_version integer not null default 0;

alter table public.restaurant_shifts
  drop constraint if exists restaurant_shifts_reconciliation_values_check;
alter table public.restaurant_shifts
  add constraint restaurant_shifts_reconciliation_values_check check (
    (card_terminal_total is null or card_terminal_total >= 0)
    and (upi_reported_total is null or upi_reported_total >= 0)
    and jsonb_typeof(marketplace_sales) = 'array'
    and marketplace_sales_total >= 0
    and combined_operational_sales >= 0
    and close_report_version >= 0
  );

create table if not exists public.shift_close_reports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  shift_id uuid not null,
  version integer not null check (version > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  correction_reason text
    check (
      correction_reason is null
      or char_length(trim(correction_reason)) between 1 and 500
    ),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  constraint shift_close_reports_shift_tenant_fkey
    foreign key (shift_id, restaurant_id)
    references public.restaurant_shifts(id, restaurant_id)
    on delete restrict,
  constraint shift_close_reports_shift_version_unique
    unique (shift_id, version)
);

create index if not exists idx_shift_close_reports_tenant_shift_version
on public.shift_close_reports(restaurant_id, shift_id, version desc);

alter table public.shift_close_reports enable row level security;

drop policy if exists "Read shift close reports (managers all, staff own)"
on public.shift_close_reports;
create policy "Read shift close reports (managers all, staff own)"
on public.shift_close_reports for select
using (
  public.is_super_admin()
  or public.is_restaurant_member(
    shift_close_reports.restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
  or (
    public.is_restaurant_member(
      shift_close_reports.restaurant_id,
      array['staff']
    )
    and exists (
      select 1
      from public.restaurant_shifts shift
      where shift.id = shift_close_reports.shift_id
        and shift.restaurant_id = shift_close_reports.restaurant_id
        and shift.opened_by_user_id = auth.uid()
    )
  )
);

revoke all on table public.shift_close_reports from anon, authenticated;
grant select on table public.shift_close_reports to authenticated;

create or replace function public.normalize_shift_marketplace_sales(
  requested_sales jsonb,
  required_channels text[]
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $normalize_marketplaces$
declare
  normalized jsonb;
  requested_count integer;
begin
  if not public.valid_shift_marketplace_channels(coalesce(required_channels, '{}'::text[])) then
    raise exception 'Invalid marketplace configuration';
  end if;

  if jsonb_typeof(coalesce(requested_sales, '[]'::jsonb)) <> 'array' then
    raise exception 'Marketplace reconciliation must be a list';
  end if;

  requested_count := jsonb_array_length(coalesce(requested_sales, '[]'::jsonb));

  if requested_count <> cardinality(coalesce(required_channels, '{}'::text[])) then
    raise exception 'Confirm every enabled marketplace before closing';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(requested_sales, '[]'::jsonb))
      as entry(channel text, status text, order_count integer, gross_sales numeric, note text)
    where entry.channel is null
      or not (entry.channel = any(coalesce(required_channels, '{}'::text[])))
      or entry.status not in ('entered', 'zero', 'unavailable')
      or (entry.status = 'entered' and (
        entry.gross_sales is null
        or entry.gross_sales < 0
        or entry.gross_sales > 99999999.99
        or entry.order_count is not null and entry.order_count < 0
      ))
      or (entry.status = 'zero' and (
        coalesce(entry.gross_sales, 0) <> 0
        or coalesce(entry.order_count, 0) <> 0
      ))
      or char_length(coalesce(entry.note, '')) > 200
  ) then
    raise exception 'Enter valid marketplace totals or mark the report unavailable';
  end if;

  if (
    select count(distinct entry.channel)
    from jsonb_to_recordset(coalesce(requested_sales, '[]'::jsonb))
      as entry(channel text)
  ) <> requested_count then
    raise exception 'Each marketplace can be reconciled only once';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'channel', entry.channel,
        'status', entry.status,
        'order_count', case
          when entry.status = 'unavailable' then null
          when entry.status = 'zero' then 0
          else entry.order_count
        end,
        'gross_sales', case
          when entry.status = 'unavailable' then null
          when entry.status = 'zero' then 0
          else round(entry.gross_sales, 2)
        end,
        'note', nullif(left(trim(entry.note), 200), '')
      )
      order by array_position(required_channels, entry.channel)
    ),
    '[]'::jsonb
  )
  into normalized
  from jsonb_to_recordset(coalesce(requested_sales, '[]'::jsonb))
    as entry(channel text, status text, order_count integer, gross_sales numeric, note text);

  return normalized;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Enter valid marketplace totals or mark the report unavailable';
end;
$normalize_marketplaces$;

create or replace function public.close_restaurant_shift_v2(
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
as $close_shift_v2$
declare
  actor_role text;
  target_shift public.restaurant_shifts%rowtype;
  tenant public.restaurants%rowtype;
  summary jsonb;
  normalized_marketplaces jsonb;
  expected_cash numeric(10, 2);
  cash_difference numeric(10, 2);
  expected_card numeric(10, 2);
  card_difference numeric(10, 2);
  expected_upi numeric(10, 2);
  upi_difference numeric(10, 2);
  marketplaces_total numeric(10, 2);
  combined_sales numeric(10, 2);
  report_snapshot jsonb;
  closed_timestamp timestamptz := now();
begin
  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);

  select * into tenant
  from public.restaurants
  where id = target_restaurant_id;

  if not found then
    raise exception 'Restaurant not found';
  end if;

  select * into target_shift
  from public.restaurant_shifts
  where id = target_shift_id
    and restaurant_id = target_restaurant_id
    and status = 'open'
  for update;

  if not found then
    raise exception 'Open shift not found';
  end if;

  if actor_role is null
     or (actor_role = 'staff' and target_shift.opened_by_user_id <> event_actor_user_id) then
    raise exception 'Only the shift opener or restaurant management can close this shift';
  end if;

  if requested_cash_counted_amount is null or requested_cash_counted_amount < 0 then
    raise exception 'Counted cash cannot be negative';
  end if;

  if requested_card_terminal_total is null or requested_card_terminal_total < 0 then
    raise exception 'Card terminal total cannot be negative';
  end if;

  if tenant.country_code = 'IN'
     and (requested_upi_reported_total is null or requested_upi_reported_total < 0) then
    raise exception 'UPI reported total cannot be negative';
  end if;

  if tenant.country_code <> 'IN' and requested_upi_reported_total is not null then
    raise exception 'UPI reconciliation is available only for India restaurants';
  end if;

  if exists (
    select 1
    from public.orders
    where restaurant_id = target_restaurant_id
      and status in ('New', 'Accepted', 'Preparing', 'Ready to Serve', 'Out for Delivery')
  ) then
    raise exception 'Cannot close shift while active orders remain';
  end if;

  normalized_marketplaces := public.normalize_shift_marketplace_sales(
    requested_marketplace_sales,
    tenant.shift_marketplace_channels
  );

  summary := public.calculate_restaurant_shift_summary(
    target_restaurant_id,
    target_shift_id
  );
  expected_cash := (summary->>'expected_cash_amount')::numeric(10, 2);
  expected_card := (summary->>'card_on_delivery_total')::numeric(10, 2);
  expected_upi := (summary->>'upi_total')::numeric(10, 2);
  cash_difference := round(requested_cash_counted_amount, 2) - expected_cash;
  card_difference := round(requested_card_terminal_total, 2) - expected_card;
  upi_difference := case when tenant.country_code = 'IN'
    then round(requested_upi_reported_total, 2) - expected_upi
    else null
  end;

  select coalesce(sum((entry->>'gross_sales')::numeric), 0)::numeric(10, 2)
  into marketplaces_total
  from jsonb_array_elements(normalized_marketplaces) entry
  where entry->>'status' in ('entered', 'zero');

  combined_sales :=
    (summary->>'completed_sales')::numeric(10, 2) + marketplaces_total;

  if (cash_difference <> 0 or card_difference <> 0 or coalesce(upi_difference, 0) <> 0)
     and nullif(trim(requested_closing_note), '') is null then
    raise exception 'A closing note is required when reconciliation has a difference';
  end if;

  report_snapshot := jsonb_build_object(
    'schema_version', 1,
    'report_version', 1,
    'restaurant_id', target_restaurant_id,
    'restaurant_name', tenant.name,
    'country_code', tenant.country_code,
    'currency_code', tenant.currency_code,
    'time_zone', tenant.time_zone,
    'shift_id', target_shift_id,
    'shift_name', target_shift.shift_name,
    'opened_at', target_shift.opened_at,
    'closed_at', closed_timestamp,
    'opened_by_user_id', target_shift.opened_by_user_id,
    'closed_by_user_id', event_actor_user_id,
    'opening_note', target_shift.opening_note,
    'closing_note', nullif(left(trim(requested_closing_note), 500), ''),
    'opening_cash_amount', target_shift.opening_cash_amount,
    'expected_cash_amount', expected_cash,
    'cash_counted_amount', round(requested_cash_counted_amount, 2),
    'cash_difference_amount', cash_difference,
    'expected_card_amount', expected_card,
    'card_terminal_total', round(requested_card_terminal_total, 2),
    'card_difference_amount', card_difference,
    'expected_upi_amount', expected_upi,
    'upi_reported_total', case when tenant.country_code = 'IN'
      then round(requested_upi_reported_total, 2) else null end,
    'upi_difference_amount', upi_difference,
    'completed_order_count', (summary->>'completed_order_count')::integer,
    'completed_sales', (summary->>'completed_sales')::numeric(10, 2),
    'completed_cash_order_total', (summary->>'completed_cash_order_total')::numeric(10, 2),
    'cash_paid_out_total', (summary->>'cash_paid_out_total')::numeric(10, 2),
    'cancelled_order_count', (summary->>'cancelled_order_count')::integer,
    'fulfilment_breakdown', summary->'fulfilment_breakdown',
    'marketplace_sales', normalized_marketplaces,
    'marketplace_sales_total', marketplaces_total,
    'combined_operational_sales', combined_sales,
    'report_generated_at', closed_timestamp,
    'correction_reason', null
  );

  update public.restaurant_shifts
  set
    status = 'closed',
    cash_counted_amount = round(requested_cash_counted_amount, 2),
    expected_cash_amount = expected_cash,
    difference_amount = cash_difference,
    completed_order_count = (summary->>'completed_order_count')::integer,
    completed_sales = (summary->>'completed_sales')::numeric(10, 2),
    completed_cash_order_total = (summary->>'completed_cash_order_total')::numeric(10, 2),
    card_on_delivery_total = expected_card,
    upi_total = expected_upi,
    cash_paid_out_total = (summary->>'cash_paid_out_total')::numeric(10, 2),
    cancelled_order_count = (summary->>'cancelled_order_count')::integer,
    fulfilment_breakdown = summary->'fulfilment_breakdown',
    card_terminal_total = round(requested_card_terminal_total, 2),
    card_difference_amount = card_difference,
    upi_reported_total = case when tenant.country_code = 'IN'
      then round(requested_upi_reported_total, 2) else null end,
    upi_difference_amount = upi_difference,
    marketplace_sales = normalized_marketplaces,
    marketplace_sales_total = marketplaces_total,
    combined_operational_sales = combined_sales,
    close_report_snapshot = report_snapshot,
    close_report_generated_at = closed_timestamp,
    close_report_version = 1,
    closing_note = nullif(left(trim(requested_closing_note), 500), ''),
    closed_by_user_id = event_actor_user_id,
    closed_at = closed_timestamp
  where id = target_shift_id
    and restaurant_id = target_restaurant_id
    and status = 'open';

  insert into public.shift_close_reports (
    restaurant_id,
    shift_id,
    version,
    snapshot,
    created_by_user_id
  ) values (
    target_restaurant_id,
    target_shift_id,
    1,
    report_snapshot,
    event_actor_user_id
  );

  return target_shift_id;
end;
$close_shift_v2$;

create or replace function public.revise_restaurant_shift_close_report(
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
as $revise_shift_report$
declare
  actor_role text;
  target_shift public.restaurant_shifts%rowtype;
  tenant public.restaurants%rowtype;
  report_channels text[];
  normalized_marketplaces jsonb;
  cash_difference numeric(10, 2);
  card_difference numeric(10, 2);
  upi_difference numeric(10, 2);
  marketplaces_total numeric(10, 2);
  combined_sales numeric(10, 2);
  next_version integer;
  report_snapshot jsonb;
  generated_timestamp timestamptz := now();
begin
  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);

  if actor_role is null
     or actor_role not in ('restaurant_admin', 'owner', 'manager') then
    raise exception 'Only restaurant management can correct a closed shift report';
  end if;

  if nullif(trim(requested_correction_reason), '') is null
     or char_length(trim(requested_correction_reason)) > 500 then
    raise exception 'A correction reason is required and must be 500 characters or fewer';
  end if;

  select * into tenant
  from public.restaurants
  where id = target_restaurant_id;

  select * into target_shift
  from public.restaurant_shifts
  where id = target_shift_id
    and restaurant_id = target_restaurant_id
    and status = 'closed'
    and close_report_version > 0
  for update;

  if not found then
    raise exception 'Closed shift report not found';
  end if;

  if requested_cash_counted_amount is null or requested_cash_counted_amount < 0
     or requested_card_terminal_total is null or requested_card_terminal_total < 0 then
    raise exception 'Reconciliation totals cannot be negative';
  end if;

  if tenant.country_code = 'IN'
     and (requested_upi_reported_total is null or requested_upi_reported_total < 0) then
    raise exception 'UPI reported total cannot be negative';
  end if;

  if tenant.country_code <> 'IN' and requested_upi_reported_total is not null then
    raise exception 'UPI reconciliation is available only for India restaurants';
  end if;

  select coalesce(array_agg(entry->>'channel' order by ordinal), '{}'::text[])
  into report_channels
  from jsonb_array_elements(target_shift.close_report_snapshot->'marketplace_sales')
    with ordinality as marketplace(entry, ordinal);

  normalized_marketplaces := public.normalize_shift_marketplace_sales(
    requested_marketplace_sales,
    report_channels
  );

  cash_difference := round(requested_cash_counted_amount, 2) - target_shift.expected_cash_amount;
  card_difference := round(requested_card_terminal_total, 2) - target_shift.card_on_delivery_total;
  upi_difference := case when tenant.country_code = 'IN'
    then round(requested_upi_reported_total, 2) - target_shift.upi_total
    else null
  end;

  select coalesce(sum((entry->>'gross_sales')::numeric), 0)::numeric(10, 2)
  into marketplaces_total
  from jsonb_array_elements(normalized_marketplaces) entry
  where entry->>'status' in ('entered', 'zero');

  combined_sales := target_shift.completed_sales + marketplaces_total;
  next_version := target_shift.close_report_version + 1;

  report_snapshot := jsonb_build_object(
    'schema_version', 1,
    'report_version', next_version,
    'restaurant_id', target_restaurant_id,
    'restaurant_name', tenant.name,
    'country_code', tenant.country_code,
    'currency_code', tenant.currency_code,
    'time_zone', tenant.time_zone,
    'shift_id', target_shift_id,
    'shift_name', target_shift.shift_name,
    'opened_at', target_shift.opened_at,
    'closed_at', target_shift.closed_at,
    'opened_by_user_id', target_shift.opened_by_user_id,
    'closed_by_user_id', target_shift.closed_by_user_id,
    'opening_note', target_shift.opening_note,
    'closing_note', target_shift.closing_note,
    'opening_cash_amount', target_shift.opening_cash_amount,
    'expected_cash_amount', target_shift.expected_cash_amount,
    'cash_counted_amount', round(requested_cash_counted_amount, 2),
    'cash_difference_amount', cash_difference,
    'expected_card_amount', target_shift.card_on_delivery_total,
    'card_terminal_total', round(requested_card_terminal_total, 2),
    'card_difference_amount', card_difference,
    'expected_upi_amount', target_shift.upi_total,
    'upi_reported_total', case when tenant.country_code = 'IN'
      then round(requested_upi_reported_total, 2) else null end,
    'upi_difference_amount', upi_difference,
    'completed_order_count', target_shift.completed_order_count,
    'completed_sales', target_shift.completed_sales,
    'completed_cash_order_total', target_shift.completed_cash_order_total,
    'cash_paid_out_total', target_shift.cash_paid_out_total,
    'cancelled_order_count', target_shift.cancelled_order_count,
    'fulfilment_breakdown', target_shift.fulfilment_breakdown,
    'marketplace_sales', normalized_marketplaces,
    'marketplace_sales_total', marketplaces_total,
    'combined_operational_sales', combined_sales,
    'report_generated_at', generated_timestamp,
    'correction_reason', left(trim(requested_correction_reason), 500)
  );

  update public.restaurant_shifts
  set
    cash_counted_amount = round(requested_cash_counted_amount, 2),
    difference_amount = cash_difference,
    card_terminal_total = round(requested_card_terminal_total, 2),
    card_difference_amount = card_difference,
    upi_reported_total = case when tenant.country_code = 'IN'
      then round(requested_upi_reported_total, 2) else null end,
    upi_difference_amount = upi_difference,
    marketplace_sales = normalized_marketplaces,
    marketplace_sales_total = marketplaces_total,
    combined_operational_sales = combined_sales,
    close_report_snapshot = report_snapshot,
    close_report_generated_at = generated_timestamp,
    close_report_version = next_version
  where id = target_shift_id
    and restaurant_id = target_restaurant_id;

  insert into public.shift_close_reports (
    restaurant_id,
    shift_id,
    version,
    snapshot,
    correction_reason,
    created_by_user_id
  ) values (
    target_restaurant_id,
    target_shift_id,
    next_version,
    report_snapshot,
    left(trim(requested_correction_reason), 500),
    event_actor_user_id
  );

  return next_version;
end;
$revise_shift_report$;

revoke all on function public.valid_shift_marketplace_channels(text[])
from public, anon, authenticated;
revoke all on function public.normalize_shift_marketplace_sales(jsonb, text[])
from public, anon, authenticated;
revoke all on function public.close_restaurant_shift_v2(
  uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid
) from public, anon, authenticated;
revoke all on function public.revise_restaurant_shift_close_report(
  uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid
) from public, anon, authenticated;

grant execute on function public.close_restaurant_shift_v2(
  uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid
) to service_role;
grant execute on function public.revise_restaurant_shift_close_report(
  uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid
) to service_role;
grant execute on function public.valid_shift_marketplace_channels(text[])
to service_role;

notify pgrst, 'reload schema';
