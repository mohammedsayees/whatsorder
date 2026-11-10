-- Smart Finance milestone 1: manual expenses, categories, recurring costs,
-- role permissions, audit history, and a disabled-by-default tenant flag.
-- Receipt storage/scanning and product costing are intentionally not included.

alter table public.restaurants
  add column if not exists finance_enabled boolean not null default false;

create table public.finance_role_permissions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  role text not null check (role in ('manager', 'staff')),
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_approve boolean not null default false,
  can_manage_categories boolean not null default false,
  can_manage_recurring boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_role_permissions_restaurant_role_unique unique (restaurant_id, role),
  constraint finance_role_permissions_id_restaurant_unique unique (id, restaurant_id)
);

create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  classification text not null check (
    classification in ('operating', 'purchase', 'capex', 'loan', 'owner', 'tax', 'other')
  ),
  default_allocation_months integer not null default 1
    check (default_allocation_months between 1 and 120),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_categories_id_restaurant_unique unique (id, restaurant_id),
  constraint finance_categories_restaurant_name_unique unique (restaurant_id, name)
);

create table public.finance_expenses (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid not null,
  source text not null default 'manual' check (source = 'manual'),
  description text not null check (char_length(trim(description)) between 1 and 240),
  supplier_name text check (supplier_name is null or char_length(trim(supplier_name)) between 1 and 160),
  incurred_on date not null,
  service_period_start date,
  service_period_end date,
  currency_code text not null default 'AED' check (currency_code = 'AED'),
  subtotal_fils bigint not null check (subtotal_fils >= 0),
  input_vat_fils bigint not null default 0 check (input_vat_fils >= 0),
  total_fils bigint not null check (total_fils > 0),
  vat_inclusive boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'approved', 'void')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'partial')),
  payment_method text check (
    payment_method is null or payment_method in ('cash', 'card', 'bank_transfer', 'other')
  ),
  paid_on date,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_expenses_id_restaurant_unique unique (id, restaurant_id),
  constraint finance_expenses_category_tenant_fk
    foreign key (category_id, restaurant_id)
    references public.finance_categories(id, restaurant_id),
  constraint finance_expenses_amount_reconciles
    check (subtotal_fils + input_vat_fils = total_fils),
  constraint finance_expenses_service_period_valid
    check (
      (service_period_start is null and service_period_end is null)
      or (service_period_start is not null and service_period_end is not null
        and service_period_end >= service_period_start)
    ),
  constraint finance_expenses_payment_date_valid
    check ((payment_status = 'paid' and paid_on is not null) or payment_status <> 'paid'),
  constraint finance_expenses_approval_valid
    check (
      (status = 'approved' and approved_by is not null and approved_at is not null)
      or status <> 'approved'
    )
);

create table public.finance_recurring_costs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid not null,
  description text not null check (char_length(trim(description)) between 1 and 240),
  amount_fils bigint not null check (amount_fils > 0),
  currency_code text not null default 'AED' check (currency_code = 'AED'),
  frequency text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  allocation_months integer not null default 1 check (allocation_months between 1 and 120),
  start_on date not null,
  end_on date,
  next_due_on date not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_recurring_costs_category_tenant_fk
    foreign key (category_id, restaurant_id)
    references public.finance_categories(id, restaurant_id),
  constraint finance_recurring_costs_dates_valid
    check (end_on is null or end_on >= start_on),
  constraint finance_recurring_costs_next_due_valid
    check (next_due_on >= start_on and (end_on is null or next_due_on <= end_on))
);

create table public.finance_audit_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  entity_type text not null check (
    entity_type in ('expense', 'category', 'recurring_cost', 'role_permissions')
  ),
  entity_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(trim(action)) between 1 and 80),
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index finance_expenses_restaurant_incurred
  on public.finance_expenses(restaurant_id, incurred_on desc, created_at desc);
create index finance_expenses_restaurant_status
  on public.finance_expenses(restaurant_id, status, incurred_on desc);
create index finance_recurring_costs_restaurant_due
  on public.finance_recurring_costs(restaurant_id, is_active, next_due_on);
create index finance_categories_restaurant_active
  on public.finance_categories(restaurant_id, is_active, name);
create index finance_audit_events_entity
  on public.finance_audit_events(restaurant_id, entity_type, entity_id, created_at desc);

create trigger finance_role_permissions_set_updated_at
before update on public.finance_role_permissions
for each row execute function public.set_updated_at();
create trigger finance_categories_set_updated_at
before update on public.finance_categories
for each row execute function public.set_updated_at();
create trigger finance_expenses_set_updated_at
before update on public.finance_expenses
for each row execute function public.set_updated_at();
create trigger finance_recurring_costs_set_updated_at
before update on public.finance_recurring_costs
for each row execute function public.set_updated_at();

create or replace function public.capture_finance_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $capture_finance_audit_event$
declare
  before_row jsonb;
  after_row jsonb;
  target_row jsonb;
  audit_entity_type text;
  audit_actor_id uuid;
begin
  before_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  after_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  target_row := coalesce(after_row, before_row);
  audit_entity_type := case tg_table_name
    when 'finance_expenses' then 'expense'
    when 'finance_categories' then 'category'
    when 'finance_recurring_costs' then 'recurring_cost'
    when 'finance_role_permissions' then 'role_permissions'
  end;
  audit_actor_id := coalesce(
    nullif(target_row ->> 'updated_by', '')::uuid,
    nullif(target_row ->> 'approved_by', '')::uuid,
    nullif(target_row ->> 'created_by', '')::uuid
  );

  insert into public.finance_audit_events (
    restaurant_id, entity_type, entity_id, actor_id, action, before_state, after_state
  ) values (
    (target_row ->> 'restaurant_id')::uuid,
    audit_entity_type,
    (target_row ->> 'id')::uuid,
    audit_actor_id,
    lower(tg_op),
    before_row,
    after_row
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$capture_finance_audit_event$;

create trigger finance_role_permissions_audit
after insert or update or delete on public.finance_role_permissions
for each row execute function public.capture_finance_audit_event();
create trigger finance_categories_audit
after insert or update or delete on public.finance_categories
for each row execute function public.capture_finance_audit_event();
create trigger finance_expenses_audit
after insert or update or delete on public.finance_expenses
for each row execute function public.capture_finance_audit_event();
create trigger finance_recurring_costs_audit
after insert or update or delete on public.finance_recurring_costs
for each row execute function public.capture_finance_audit_event();

create or replace function public.seed_finance_defaults(target_restaurant_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $seed_finance_defaults$
begin
  insert into public.finance_categories (
    restaurant_id, name, classification, default_allocation_months
  ) values
    (target_restaurant_id, 'Rent', 'operating', 1),
    (target_restaurant_id, 'Utilities', 'operating', 1),
    (target_restaurant_id, 'Salaries', 'operating', 1),
    (target_restaurant_id, 'Ingredients & packaging', 'purchase', 1),
    (target_restaurant_id, 'Equipment / capex', 'capex', 1),
    (target_restaurant_id, 'Taxes & government fees', 'tax', 12),
    (target_restaurant_id, 'Other', 'other', 1)
  on conflict (restaurant_id, name) do nothing;

  insert into public.finance_role_permissions (
    restaurant_id, role, can_view, can_create
  ) values (target_restaurant_id, 'manager', true, true)
  on conflict (restaurant_id, role) do nothing;
end;
$seed_finance_defaults$;

select public.seed_finance_defaults(id) from public.restaurants;

create or replace function public.seed_finance_defaults_for_restaurant()
returns trigger
language plpgsql
security definer
set search_path = public
as $seed_finance_defaults_for_restaurant$
begin
  perform public.seed_finance_defaults(new.id);
  return new;
end;
$seed_finance_defaults_for_restaurant$;

create trigger restaurants_seed_finance_defaults
after insert on public.restaurants
for each row execute function public.seed_finance_defaults_for_restaurant();

create or replace function public.has_finance_permission(
  target_restaurant_id uuid,
  requested_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $has_finance_permission$
  select exists (
    select 1
    from public.restaurant_users membership
    join public.restaurants restaurant on restaurant.id = membership.restaurant_id
    left join public.finance_role_permissions permission
      on permission.restaurant_id = membership.restaurant_id
      and permission.role = membership.role
    where membership.restaurant_id = target_restaurant_id
      and membership.user_id = auth.uid()
      and membership.accepted_at is not null
      and restaurant.finance_enabled = true
      and (
        membership.role in ('restaurant_admin', 'owner')
        or case requested_permission
          when 'view' then permission.can_view
          when 'create' then permission.can_create
          when 'approve' then permission.can_view and permission.can_approve
          when 'manage_categories' then permission.can_view and permission.can_manage_categories
          when 'manage_recurring' then permission.can_view and permission.can_manage_recurring
          else false
        end
      )
  );
$has_finance_permission$;

alter table public.finance_role_permissions enable row level security;
alter table public.finance_categories enable row level security;
alter table public.finance_expenses enable row level security;
alter table public.finance_recurring_costs enable row level security;
alter table public.finance_audit_events enable row level security;

revoke all on public.finance_role_permissions, public.finance_categories,
  public.finance_expenses, public.finance_recurring_costs, public.finance_audit_events
from public, anon, authenticated;
grant select on public.finance_role_permissions, public.finance_categories,
  public.finance_expenses, public.finance_recurring_costs, public.finance_audit_events
to authenticated;
grant all on public.finance_role_permissions, public.finance_categories,
  public.finance_expenses, public.finance_recurring_costs, public.finance_audit_events
to service_role;

create policy finance_role_permissions_owner_read
on public.finance_role_permissions for select to authenticated
using (public.is_restaurant_member(restaurant_id, array['restaurant_admin', 'owner']));

create policy finance_categories_permitted_read
on public.finance_categories for select to authenticated
using (public.has_finance_permission(restaurant_id, 'view'));
create policy finance_expenses_permitted_read
on public.finance_expenses for select to authenticated
using (public.has_finance_permission(restaurant_id, 'view'));
create policy finance_recurring_costs_permitted_read
on public.finance_recurring_costs for select to authenticated
using (public.has_finance_permission(restaurant_id, 'view'));
create policy finance_audit_events_permitted_read
on public.finance_audit_events for select to authenticated
using (public.has_finance_permission(restaurant_id, 'view'));

revoke all on function public.seed_finance_defaults(uuid)
from public, anon, authenticated;
revoke all on function public.seed_finance_defaults_for_restaurant()
from public, anon, authenticated;
revoke all on function public.capture_finance_audit_event()
from public, anon, authenticated;
revoke all on function public.has_finance_permission(uuid, text)
from public, anon, authenticated;
grant execute on function public.seed_finance_defaults(uuid) to service_role;
grant execute on function public.has_finance_permission(uuid, text)
to authenticated, service_role;

do $verify_finance_least_privilege$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename like 'finance_%'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception 'Smart Finance authenticated write policy detected';
  end if;
end;
$verify_finance_least_privilege$;

comment on column public.restaurants.finance_enabled is
  'Tenant feature flag for Smart Finance; disabled by default.';
comment on table public.finance_expenses is
  'Manual expense facts in integer fils. Purchase-classified rows are purchase spend, not consumed COGS.';
comment on table public.finance_recurring_costs is
  'Recurring expectations; these rows do not represent duplicate cash payments.';
comment on table public.finance_audit_events is
  'Append-only finance mutation history. No update/delete application path is granted.';

notify pgrst, 'reload schema';

-- Rollback: disable restaurants.finance_enabled first, then remove the trigger,
-- helper functions and finance_* tables. Keep exported audit data before dropping.
