-- Smart Finance milestone E: controlled Chai Xpress pilot enrollment.
-- Enables setup access only; release is gated by real configured data and reconciliation.

alter table public.finance_audit_events
  drop constraint if exists finance_audit_events_entity_type_check;
alter table public.finance_audit_events
  add constraint finance_audit_events_entity_type_check check (entity_type in (
    'expense', 'category', 'recurring_cost', 'role_permissions', 'finance_settings',
    'ingredient', 'purchase_price', 'recipe', 'order_channel', 'pilot_enrollment'
  ));

create table public.finance_pilot_enrollments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  status text not null default 'setup_required' check (
    status in ('setup_required', 'configured', 'reconciled', 'released', 'paused')
  ),
  sample_start date,
  sample_end date,
  readiness_snapshot jsonb not null default '{}'::jsonb,
  reconciled_by uuid references auth.users(id) on delete set null,
  reconciled_at timestamptz,
  released_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_pilot_enrollments_restaurant_unique unique (restaurant_id),
  constraint finance_pilot_enrollments_id_restaurant_unique unique (id, restaurant_id),
  constraint finance_pilot_enrollments_sample_valid check (
    (sample_start is null and sample_end is null)
    or (sample_start is not null and sample_end is not null and sample_end >= sample_start)
  )
);
create trigger finance_pilot_enrollments_set_updated_at
before update on public.finance_pilot_enrollments
for each row execute function public.set_updated_at();

create or replace function public.get_finance_pilot_readiness(target_restaurant_id uuid)
returns jsonb language sql stable security invoker set search_path = public
as $get_finance_pilot_readiness$
  with tenant as (
    select id, time_zone from public.restaurants where id = target_restaurant_id
  ), menu as (
    select count(*)::integer as item_count from public.menu_items
    where restaurant_id = target_restaurant_id and is_available
  ), recipes as (
    select count(distinct menu_item_id)::integer as base_recipe_count
    from public.finance_recipes where restaurant_id = target_restaurant_id
      and menu_option_id is null and status = 'active'
  ), prices as (
    select count(distinct ingredient_id)::integer as priced_ingredient_count
    from public.finance_purchase_prices where restaurant_id = target_restaurant_id
  ), recurring as (
    select count(*)::integer as recurring_cost_count from public.finance_recurring_costs cost
    join public.finance_categories category on category.id = cost.category_id
      and category.restaurant_id = cost.restaurant_id
    where cost.restaurant_id = target_restaurant_id and cost.is_active
      and category.classification = 'operating'
  ), sample as (
    select count(*)::integer as snapshot_count,
      count(*) filter (where snapshot.completeness = 'complete')::integer as complete_count
    from public.finance_product_cost_snapshots snapshot
    join public.orders on orders.id = snapshot.order_id and orders.restaurant_id = snapshot.restaurant_id
    join tenant on true
    where snapshot.restaurant_id = target_restaurant_id and orders.status = 'Completed'
      and orders.created_at >= now() - interval '30 days'
  )
  select jsonb_build_object(
    'menu_item_count', menu.item_count,
    'base_recipe_count', recipes.base_recipe_count,
    'priced_ingredient_count', prices.priced_ingredient_count,
    'recurring_cost_count', recurring.recurring_cost_count,
    'snapshot_count', sample.snapshot_count,
    'complete_snapshot_count', sample.complete_count,
    'coverage_pct', case when sample.snapshot_count = 0 then 0
      else round(sample.complete_count * 100.0 / sample.snapshot_count, 2) end,
    'ready_for_reconciliation', menu.item_count > 0 and recipes.base_recipe_count >= menu.item_count
      and prices.priced_ingredient_count > 0 and recurring.recurring_cost_count > 0
      and sample.snapshot_count > 0,
    'ready_for_release', menu.item_count > 0 and recipes.base_recipe_count >= menu.item_count
      and prices.priced_ingredient_count > 0 and recurring.recurring_cost_count > 0
      and sample.snapshot_count > 0 and sample.complete_count * 100 >= sample.snapshot_count * 80
  )
  from menu, recipes, prices, recurring, sample;
$get_finance_pilot_readiness$;

create or replace function public.advance_finance_pilot(
  target_restaurant_id uuid, requested_status text, requested_sample_start date,
  requested_sample_end date, event_actor_user_id uuid
)
returns jsonb language plpgsql security invoker set search_path = public
as $advance_finance_pilot$
declare
  readiness jsonb;
  current_status text;
begin
  if not exists (select 1 from public.restaurants where id = target_restaurant_id and slug = 'chaixpress') then
    raise exception 'Pilot status is limited to Chai Xpress';
  end if;
  if requested_status not in ('configured', 'reconciled', 'released', 'paused') then
    raise exception 'Invalid pilot status';
  end if;
  select status into current_status from public.finance_pilot_enrollments
  where restaurant_id = target_restaurant_id for update;
  readiness := public.get_finance_pilot_readiness(target_restaurant_id);
  if requested_status = 'configured' and coalesce((readiness->>'ready_for_reconciliation')::boolean, false) is false then
    raise exception 'Pilot configuration is incomplete';
  end if;
  if requested_status in ('reconciled', 'released') and (
    requested_sample_start is null or requested_sample_end is null
    or requested_sample_end < requested_sample_start
    or requested_sample_end - requested_sample_start > 31
    or coalesce((readiness->>'ready_for_release')::boolean, false) is false
  ) then raise exception 'Pilot reconciliation or coverage is incomplete'; end if;
  if requested_status = 'released' and current_status <> 'reconciled' then
    raise exception 'Pilot must be reconciled before release';
  end if;
  update public.finance_pilot_enrollments set
    status = requested_status,
    sample_start = coalesce(requested_sample_start, sample_start),
    sample_end = coalesce(requested_sample_end, sample_end),
    readiness_snapshot = readiness,
    reconciled_by = case when requested_status in ('reconciled', 'released') then event_actor_user_id else reconciled_by end,
    reconciled_at = case when requested_status = 'reconciled' then now() else reconciled_at end,
    released_at = case when requested_status = 'released' then now() else released_at end,
    updated_by = event_actor_user_id
  where restaurant_id = target_restaurant_id;
  return readiness || jsonb_build_object('status', requested_status);
end;
$advance_finance_pilot$;

create or replace function public.capture_finance_pilot_audit_event()
returns trigger language plpgsql security definer set search_path = public
as $capture_finance_pilot_audit_event$
begin
  insert into public.finance_audit_events (
    restaurant_id, entity_type, entity_id, actor_id, action, before_state, after_state
  ) values (
    coalesce(new.restaurant_id, old.restaurant_id), 'pilot_enrollment', coalesce(new.id, old.id),
    coalesce(new.updated_by, old.updated_by), lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$capture_finance_pilot_audit_event$;
create trigger finance_pilot_enrollments_audit
after insert or update or delete on public.finance_pilot_enrollments
for each row execute function public.capture_finance_pilot_audit_event();

update public.restaurants set finance_enabled = true where slug = 'chaixpress';
insert into public.finance_pilot_enrollments (restaurant_id)
select id from public.restaurants where slug = 'chaixpress'
on conflict (restaurant_id) do nothing;

alter table public.finance_pilot_enrollments enable row level security;
revoke all on public.finance_pilot_enrollments from public, anon, authenticated;
grant select on public.finance_pilot_enrollments to authenticated;
grant all on public.finance_pilot_enrollments to service_role;
create policy finance_pilot_enrollments_permitted_read
on public.finance_pilot_enrollments for select to authenticated
using (public.has_finance_permission(restaurant_id, 'view_reports'));

revoke all on function public.get_finance_pilot_readiness(uuid),
  public.advance_finance_pilot(uuid, text, date, date, uuid),
  public.capture_finance_pilot_audit_event()
from public, anon, authenticated;
grant execute on function public.get_finance_pilot_readiness(uuid),
  public.advance_finance_pilot(uuid, text, date, date, uuid)
to service_role;

do $verify_finance_pilot_security$
begin
  if exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'finance_pilot_enrollments' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) then
    raise exception 'Finance pilot write policy detected';
  end if;
end;
$verify_finance_pilot_security$;

comment on table public.finance_pilot_enrollments is
  'Controlled pilot state. Chai Xpress setup is enabled, but release requires real costs, >=80% snapshot coverage and manual sample reconciliation.';
notify pgrst, 'reload schema';
