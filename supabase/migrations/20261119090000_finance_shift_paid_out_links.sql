-- Smart Finance: link shift cash paid-outs to finance expenses (phase 1).
--
-- A shift cash paid-out records cash that physically left the drawer. A finance
-- expense is the accounting record of a bill. This migration lets a finance
-- approver link the two one-to-one, convert a bill-less paid-out into an
-- expense, or dismiss it as "not an expense" (cash advance, safe drop, ...).
--
-- Shift cash math is NOT changed: no shift function, summary, close or report
-- RPC is redefined, and links never change a paid-out's amount. The only change
-- to a shift table is an additive (id, restaurant_id) unique constraint so the
-- link can carry a tenant-consistent foreign key (id is already the primary key).
--
-- Links are soft-removed (removed_at) instead of deleted, so the history of who
-- linked, unlinked or dismissed what stays in the row and in the audit log.

alter table public.shift_cash_paid_outs
  add constraint shift_cash_paid_outs_id_restaurant_unique unique (id, restaurant_id);

-- The "without a bill" queue only covers paid-outs from the day the feature was
-- installed (or the day a restaurant was created), so old free-text paid-outs
-- don't flood it.
alter table public.finance_settings
  add column paid_out_tracking_from date not null default current_date;

alter table public.finance_audit_events
  drop constraint if exists finance_audit_events_entity_type_check;
alter table public.finance_audit_events
  add constraint finance_audit_events_entity_type_check check (entity_type in (
    'expense', 'category', 'recurring_cost', 'role_permissions', 'finance_settings',
    'ingredient', 'purchase_price', 'recipe', 'order_channel', 'pilot_enrollment',
    'paid_out_link'
  ));

create table public.finance_paid_out_links (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  paid_out_id uuid not null,
  expense_id uuid,
  status text not null check (status in ('linked', 'dismissed')),
  paid_out_amount_fils bigint not null check (paid_out_amount_fils > 0),
  expense_total_fils bigint check (expense_total_fils is null or expense_total_fils > 0),
  -- Paid-out minus bill total. Positive: more cash left the till than the bill.
  difference_fils bigint,
  mismatch_reason text check (
    mismatch_reason is null or char_length(trim(mismatch_reason)) between 1 and 300
  ),
  dismiss_reason text check (
    dismiss_reason is null or char_length(trim(dismiss_reason)) between 1 and 300
  ),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references auth.users(id) on delete set null,
  removal_reason text check (
    removal_reason is null or char_length(trim(removal_reason)) between 1 and 300
  ),
  constraint finance_paid_out_links_id_restaurant_unique unique (id, restaurant_id),
  constraint finance_paid_out_links_paid_out_tenant_fk
    foreign key (paid_out_id, restaurant_id)
    references public.shift_cash_paid_outs(id, restaurant_id),
  constraint finance_paid_out_links_expense_tenant_fk
    foreign key (expense_id, restaurant_id)
    references public.finance_expenses(id, restaurant_id),
  constraint finance_paid_out_links_shape check (
    (
      status = 'linked'
      and expense_id is not null
      and expense_total_fils is not null
      and difference_fils = paid_out_amount_fils - expense_total_fils
      and (difference_fils = 0 or mismatch_reason is not null)
      and dismiss_reason is null
    )
    or (
      status = 'dismissed'
      and expense_id is null
      and expense_total_fils is null
      and difference_fils is null
      and mismatch_reason is null
      and dismiss_reason is not null
    )
  ),
  constraint finance_paid_out_links_removal_valid check (
    (removed_at is null and removed_by is null and removal_reason is null)
    or (removed_at is not null and removal_reason is not null)
  )
);

-- One paid-out = one bill: at most one active link per paid-out and per expense.
create unique index finance_paid_out_links_active_paid_out
  on public.finance_paid_out_links(paid_out_id) where removed_at is null;
create unique index finance_paid_out_links_active_expense
  on public.finance_paid_out_links(expense_id)
  where removed_at is null and expense_id is not null;
create index finance_paid_out_links_restaurant_created
  on public.finance_paid_out_links(restaurant_id, created_at desc);

-- Re-declare the shared audit capture with the new table mapped.
create or replace function public.capture_finance_audit_event()
returns trigger language plpgsql security definer set search_path = public
as $capture_finance_audit_event$
declare
  before_row jsonb; after_row jsonb; target_row jsonb; audit_entity_type text; audit_actor_id uuid;
begin
  before_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  after_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  target_row := coalesce(after_row, before_row);
  audit_entity_type := case tg_table_name
    when 'finance_expenses' then 'expense' when 'finance_categories' then 'category'
    when 'finance_recurring_costs' then 'recurring_cost' when 'finance_role_permissions' then 'role_permissions'
    when 'finance_settings' then 'finance_settings' when 'finance_ingredients' then 'ingredient'
    when 'finance_purchase_prices' then 'purchase_price' when 'finance_recipes' then 'recipe'
    when 'finance_order_channels' then 'order_channel'
    when 'finance_paid_out_links' then 'paid_out_link' end;
  audit_actor_id := coalesce(nullif(target_row->>'updated_by', '')::uuid,
    nullif(target_row->>'confirmed_by', '')::uuid, nullif(target_row->>'created_by', '')::uuid,
    nullif(target_row->>'approved_by', '')::uuid);
  insert into public.finance_audit_events (
    restaurant_id, entity_type, entity_id, actor_id, action, before_state, after_state
  ) values ((target_row->>'restaurant_id')::uuid, audit_entity_type,
    coalesce(nullif(target_row->>'id', '')::uuid, (target_row->>'restaurant_id')::uuid),
    audit_actor_id, lower(tg_op), before_row, after_row);
  if tg_op = 'DELETE' then return old; end if; return new;
end;
$capture_finance_audit_event$;

create trigger finance_paid_out_links_audit
after insert or update or delete on public.finance_paid_out_links
for each row execute function public.capture_finance_audit_event();

-- Voiding a linked expense releases its paid-out back to the "without a bill"
-- queue: the cash really left the drawer, so the paid-out itself stays.
create or replace function public.release_finance_paid_out_link_on_void()
returns trigger language plpgsql security definer set search_path = public
as $release_paid_out_link$
begin
  if new.status = 'void' and old.status is distinct from 'void' then
    update public.finance_paid_out_links
    set removed_at = now(), removed_by = new.updated_by, updated_by = new.updated_by,
        removal_reason = 'Linked expense was voided'
    where restaurant_id = new.restaurant_id and expense_id = new.id and removed_at is null;
  end if;
  return new;
end;
$release_paid_out_link$;

create trigger finance_expenses_release_paid_out_link
after update of status on public.finance_expenses
for each row execute function public.release_finance_paid_out_link_on_void();

-- Shared guard + context lookup for one paid-out. Locks the paid-out row so two
-- approvers can't link the same paid-out concurrently.
create or replace function public.finance_paid_out_context(
  target_restaurant_id uuid, target_paid_out_id uuid
)
returns table (paid_out_amount_fils bigint, paid_out_reason text, business_date date)
language plpgsql security invoker set search_path = public
as $finance_paid_out_context$
declare
  restaurant_row public.restaurants;
begin
  select * into restaurant_row from public.restaurants where id = target_restaurant_id;
  if restaurant_row.id is null or restaurant_row.finance_enabled is not true then
    raise exception 'Finance is not enabled for this restaurant';
  end if;
  if restaurant_row.currency_code <> 'AED' then
    raise exception 'Paid-out linking is only available for AED restaurants';
  end if;

  perform 1 from public.shift_cash_paid_outs paid_out
  where paid_out.id = target_paid_out_id and paid_out.restaurant_id = target_restaurant_id
  for update;
  if not found then raise exception 'Paid-out not found'; end if;

  return query
  select round(paid_out.amount * 100)::bigint,
    paid_out.reason,
    coalesce(business_day.business_date,
      (shift.opened_at at time zone restaurant_row.time_zone)::date)
  from public.shift_cash_paid_outs paid_out
  join public.restaurant_shifts shift
    on shift.id = paid_out.shift_id and shift.restaurant_id = paid_out.restaurant_id
  left join public.business_days business_day
    on business_day.id = shift.business_day_id and business_day.restaurant_id = shift.restaurant_id
  where paid_out.id = target_paid_out_id and paid_out.restaurant_id = target_restaurant_id;
end;
$finance_paid_out_context$;

create or replace function public.link_finance_paid_out_to_expense(
  target_restaurant_id uuid,
  target_paid_out_id uuid,
  target_expense_id uuid,
  confirm_mismatch boolean,
  requested_mismatch_reason text,
  event_actor_user_id uuid
)
returns uuid language plpgsql security invoker set search_path = public
as $link_finance_paid_out$
declare
  context record;
  expense_row public.finance_expenses;
  difference bigint;
  mismatch_text text := nullif(trim(coalesce(requested_mismatch_reason, '')), '');
  new_link_id uuid;
begin
  select * into context from public.finance_paid_out_context(target_restaurant_id, target_paid_out_id);
  if exists (select 1 from public.finance_paid_out_links
    where paid_out_id = target_paid_out_id and removed_at is null) then
    raise exception 'This paid-out is already linked or dismissed';
  end if;

  select * into expense_row from public.finance_expenses
  where id = target_expense_id and restaurant_id = target_restaurant_id
  for update;
  if expense_row.id is null or expense_row.status = 'void' then
    raise exception 'Expense not found or voided';
  end if;
  if exists (select 1 from public.finance_paid_out_links
    where expense_id = target_expense_id and removed_at is null) then
    raise exception 'This expense is already linked to another paid-out';
  end if;

  difference := context.paid_out_amount_fils - expense_row.total_fils;
  if difference <> 0 and (confirm_mismatch is not true or mismatch_text is null) then
    raise exception 'Amounts differ: confirm the mismatch and give a reason';
  end if;
  if mismatch_text is not null and char_length(mismatch_text) > 300 then
    raise exception 'Mismatch reason must be 300 characters or fewer';
  end if;

  -- The paid-out is the evidence of payment: cash, on the shift's business date.
  update public.finance_expenses
  set payment_method = 'cash',
      payment_status = case when context.paid_out_amount_fils < expense_row.total_fils
        then 'partial' else 'paid' end,
      paid_on = context.business_date,
      updated_by = event_actor_user_id
  where id = target_expense_id and restaurant_id = target_restaurant_id;

  insert into public.finance_paid_out_links (
    restaurant_id, paid_out_id, expense_id, status, paid_out_amount_fils,
    expense_total_fils, difference_fils, mismatch_reason, created_by, updated_by
  ) values (
    target_restaurant_id, target_paid_out_id, target_expense_id, 'linked',
    context.paid_out_amount_fils, expense_row.total_fils, difference,
    case when difference = 0 then null else mismatch_text end,
    event_actor_user_id, event_actor_user_id
  ) returning id into new_link_id;
  return new_link_id;
end;
$link_finance_paid_out$;

create or replace function public.convert_finance_paid_out_to_expense(
  target_restaurant_id uuid,
  target_paid_out_id uuid,
  requested_category_id uuid,
  requested_description text,
  requested_supplier_name text,
  event_actor_user_id uuid
)
returns uuid language plpgsql security invoker set search_path = public
as $convert_finance_paid_out$
declare
  context record;
  description_text text := nullif(trim(coalesce(requested_description, '')), '');
  supplier_text text := nullif(trim(coalesce(requested_supplier_name, '')), '');
  new_expense_id uuid;
begin
  select * into context from public.finance_paid_out_context(target_restaurant_id, target_paid_out_id);
  if exists (select 1 from public.finance_paid_out_links
    where paid_out_id = target_paid_out_id and removed_at is null) then
    raise exception 'This paid-out is already linked or dismissed';
  end if;
  if not exists (select 1 from public.finance_categories
    where id = requested_category_id and restaurant_id = target_restaurant_id and is_active) then
    raise exception 'Invalid finance category';
  end if;
  description_text := coalesce(description_text, left(trim(context.paid_out_reason), 240));

  insert into public.finance_expenses (
    restaurant_id, category_id, source, description, supplier_name, incurred_on,
    subtotal_fils, input_vat_fils, total_fils, vat_inclusive, status,
    payment_status, payment_method, paid_on,
    created_by, updated_by, approved_by, approved_at
  ) values (
    target_restaurant_id, requested_category_id, 'manual', description_text, supplier_text,
    context.business_date, context.paid_out_amount_fils, 0, context.paid_out_amount_fils, false,
    'approved', 'paid', 'cash', context.business_date,
    event_actor_user_id, event_actor_user_id, event_actor_user_id, now()
  ) returning id into new_expense_id;

  insert into public.finance_paid_out_links (
    restaurant_id, paid_out_id, expense_id, status, paid_out_amount_fils,
    expense_total_fils, difference_fils, created_by, updated_by
  ) values (
    target_restaurant_id, target_paid_out_id, new_expense_id, 'linked',
    context.paid_out_amount_fils, context.paid_out_amount_fils, 0,
    event_actor_user_id, event_actor_user_id
  );
  return new_expense_id;
end;
$convert_finance_paid_out$;

create or replace function public.dismiss_finance_paid_out(
  target_restaurant_id uuid,
  target_paid_out_id uuid,
  requested_reason text,
  event_actor_user_id uuid
)
returns uuid language plpgsql security invoker set search_path = public
as $dismiss_finance_paid_out$
declare
  context record;
  reason_text text := nullif(trim(coalesce(requested_reason, '')), '');
  new_link_id uuid;
begin
  select * into context from public.finance_paid_out_context(target_restaurant_id, target_paid_out_id);
  if reason_text is null or char_length(reason_text) > 300 then
    raise exception 'A reason of up to 300 characters is required';
  end if;
  if exists (select 1 from public.finance_paid_out_links
    where paid_out_id = target_paid_out_id and removed_at is null) then
    raise exception 'This paid-out is already linked or dismissed';
  end if;
  insert into public.finance_paid_out_links (
    restaurant_id, paid_out_id, status, paid_out_amount_fils, dismiss_reason,
    created_by, updated_by
  ) values (
    target_restaurant_id, target_paid_out_id, 'dismissed', context.paid_out_amount_fils,
    reason_text, event_actor_user_id, event_actor_user_id
  ) returning id into new_link_id;
  return new_link_id;
end;
$dismiss_finance_paid_out$;

-- Unlinking does not revert the expense's payment fields; the approver can void
-- or re-record the expense if the payment details were wrong.
create or replace function public.unlink_finance_paid_out(
  target_restaurant_id uuid,
  target_link_id uuid,
  requested_reason text,
  event_actor_user_id uuid
)
returns boolean language plpgsql security invoker set search_path = public
as $unlink_finance_paid_out$
declare
  reason_text text := nullif(trim(coalesce(requested_reason, '')), '');
begin
  if reason_text is null or char_length(reason_text) > 300 then
    raise exception 'A reason of up to 300 characters is required';
  end if;
  update public.finance_paid_out_links
  set removed_at = now(), removed_by = event_actor_user_id,
      updated_by = event_actor_user_id, removal_reason = reason_text
  where id = target_link_id and restaurant_id = target_restaurant_id and removed_at is null;
  return found;
end;
$unlink_finance_paid_out$;

-- Paid-outs on or after the tracking start date that have no active link.
create or replace function public.get_finance_unbilled_paid_outs(
  target_restaurant_id uuid, requested_limit integer default 200
)
returns table (
  paid_out_id uuid, shift_id uuid, shift_status text, amount numeric,
  reason text, recorded_at timestamptz, business_date date
)
language sql stable security invoker set search_path = public
as $get_finance_unbilled_paid_outs$
  select paid_out.id, paid_out.shift_id, shift.status, paid_out.amount, paid_out.reason,
    paid_out.recorded_at,
    coalesce(business_day.business_date, (shift.opened_at at time zone restaurant.time_zone)::date)
  from public.shift_cash_paid_outs paid_out
  join public.restaurants restaurant on restaurant.id = paid_out.restaurant_id
  join public.finance_settings settings on settings.restaurant_id = paid_out.restaurant_id
  join public.restaurant_shifts shift
    on shift.id = paid_out.shift_id and shift.restaurant_id = paid_out.restaurant_id
  left join public.business_days business_day
    on business_day.id = shift.business_day_id and business_day.restaurant_id = shift.restaurant_id
  where paid_out.restaurant_id = target_restaurant_id
    and (paid_out.recorded_at at time zone restaurant.time_zone)::date >= settings.paid_out_tracking_from
    and not exists (
      select 1 from public.finance_paid_out_links link
      where link.paid_out_id = paid_out.id and link.removed_at is null
    )
  order by paid_out.recorded_at desc
  limit least(greatest(coalesce(requested_limit, 200), 1), 500);
$get_finance_unbilled_paid_outs$;

alter table public.finance_paid_out_links enable row level security;
revoke all on public.finance_paid_out_links from public, anon, authenticated;
grant select on public.finance_paid_out_links to authenticated;
grant all on public.finance_paid_out_links to service_role;
create policy finance_paid_out_links_permitted_read
on public.finance_paid_out_links for select to authenticated
using (public.has_finance_permission(restaurant_id, 'view'));

revoke all on function public.release_finance_paid_out_link_on_void(),
  public.finance_paid_out_context(uuid, uuid),
  public.link_finance_paid_out_to_expense(uuid, uuid, uuid, boolean, text, uuid),
  public.convert_finance_paid_out_to_expense(uuid, uuid, uuid, text, text, uuid),
  public.dismiss_finance_paid_out(uuid, uuid, text, uuid),
  public.unlink_finance_paid_out(uuid, uuid, text, uuid),
  public.get_finance_unbilled_paid_outs(uuid, integer)
from public, anon, authenticated;
grant execute on function public.finance_paid_out_context(uuid, uuid),
  public.link_finance_paid_out_to_expense(uuid, uuid, uuid, boolean, text, uuid),
  public.convert_finance_paid_out_to_expense(uuid, uuid, uuid, text, text, uuid),
  public.dismiss_finance_paid_out(uuid, uuid, text, uuid),
  public.unlink_finance_paid_out(uuid, uuid, text, uuid),
  public.get_finance_unbilled_paid_outs(uuid, integer)
to service_role;

do $verify_finance_paid_out_link_security$
begin
  if exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'finance_paid_out_links' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) then
    raise exception 'Finance paid-out link write policy detected';
  end if;
end;
$verify_finance_paid_out_link_security$;

comment on table public.finance_paid_out_links is
  'One-to-one links between shift cash paid-outs and finance expenses, or a dismissal. Never changes shift cash math.';
comment on column public.finance_settings.paid_out_tracking_from is
  'First business date whose cash paid-outs appear in the Finance "without a bill" queue.';

notify pgrst, 'reload schema';

-- Rollback: drop the release trigger and its function, the five RPCs and
-- finance_paid_out_context, then finance_paid_out_links (export it first), the
-- finance_settings.paid_out_tracking_from column and the
-- shift_cash_paid_outs_id_restaurant_unique constraint. Re-create
-- capture_finance_audit_event without the paid_out_link mapping.
