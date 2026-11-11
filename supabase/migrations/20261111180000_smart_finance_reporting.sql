-- Smart Finance milestone D: report telemetry, recurring-payment linkage and
-- bounded historical snapshot backfill. Financial aggregation stays deterministic.

alter table public.finance_recurring_costs
  add constraint finance_recurring_costs_id_restaurant_unique unique (id, restaurant_id);
alter table public.finance_expenses
  add column recurring_cost_id uuid,
  add constraint finance_expenses_recurring_cost_tenant_fk
    foreign key (recurring_cost_id, restaurant_id)
    references public.finance_recurring_costs(id, restaurant_id);

create table public.finance_report_runs (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  order_count integer not null check (order_count >= 0),
  coverage_bps integer not null check (coverage_bps between 0 and 10000),
  incomplete_line_count integer not null check (incomplete_line_count >= 0),
  generated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint finance_report_runs_period_valid check (period_end >= period_start)
);
create index finance_report_runs_restaurant_created
  on public.finance_report_runs(restaurant_id, created_at desc);

create or replace function public.backfill_finance_cost_snapshots(
  target_restaurant_id uuid, requested_start date, requested_end date,
  requested_limit integer default 500
)
returns jsonb language plpgsql security invoker set search_path = public
as $backfill_finance_cost_snapshots$
declare
  order_row record;
  processed integer := 0;
  created_count integer := 0;
begin
  if requested_end < requested_start or requested_end - requested_start > 366
     or requested_limit < 1 or requested_limit > 1000 then
    raise exception 'Invalid finance backfill range';
  end if;
  for order_row in
    select orders.id from public.orders
    join public.restaurants on restaurants.id = orders.restaurant_id
    where orders.restaurant_id = target_restaurant_id and orders.status = 'Completed'
      and (orders.created_at at time zone restaurants.time_zone)::date
        between requested_start and requested_end
    order by orders.created_at, orders.id limit requested_limit
  loop
    processed := processed + 1;
    created_count := created_count + public.snapshot_finance_order_costs(
      target_restaurant_id, order_row.id, false
    );
  end loop;
  return jsonb_build_object('orders_processed', processed, 'snapshots_created', created_count);
end;
$backfill_finance_cost_snapshots$;

alter table public.finance_report_runs enable row level security;
revoke all on public.finance_report_runs from public, anon, authenticated;
grant select on public.finance_report_runs to authenticated;
grant all on public.finance_report_runs to service_role;
create policy finance_report_runs_permitted_read on public.finance_report_runs for select to authenticated
using (public.has_finance_permission(restaurant_id, 'view_reports'));

revoke all on function public.backfill_finance_cost_snapshots(uuid, date, date, integer)
from public, anon, authenticated;
grant execute on function public.backfill_finance_cost_snapshots(uuid, date, date, integer)
to service_role;

do $verify_finance_report_security$
begin
  if exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'finance_report_runs' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) then
    raise exception 'Finance report write policy detected';
  end if;
end;
$verify_finance_report_security$;

comment on table public.finance_report_runs is
  'Non-PII report telemetry for coverage and incomplete-cost monitoring.';
notify pgrst, 'reload schema';
