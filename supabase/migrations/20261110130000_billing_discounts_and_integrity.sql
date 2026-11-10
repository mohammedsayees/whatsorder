-- Contract-level discounts and transactional billing mutations.
-- Existing rows are preserved; no payment or invoice history is rewritten.

alter table public.subscriptions
add column if not exists price_override numeric(10, 2),
add column if not exists price_override_reason text,
add column if not exists price_override_ends_at date,
add column if not exists price_override_created_by uuid references auth.users(id) on delete set null,
add column if not exists price_override_updated_at timestamptz;

do $subscription_price_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subscriptions_price_override_nonnegative'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
    add constraint subscriptions_price_override_nonnegative
    check (price_override is null or price_override >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'subscriptions_price_override_reason_required'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
    add constraint subscriptions_price_override_reason_required
    check (price_override is null or nullif(btrim(price_override_reason), '') is not null);
  end if;
end;
$subscription_price_constraints$;

create table if not exists public.subscription_price_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  subscription_id uuid not null,
  previous_price numeric(10, 2),
  new_price numeric(10, 2),
  billing_interval text not null check (billing_interval in ('monthly', 'yearly')),
  reason text not null,
  ends_at date,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  created_at timestamptz not null default now(),
  constraint subscription_price_events_subscription_tenant_fkey
    foreign key (subscription_id, restaurant_id)
    references public.subscriptions(id, restaurant_id)
    on delete cascade
);

create index if not exists idx_subscription_price_events_sub_created
on public.subscription_price_events(restaurant_id, subscription_id, created_at desc);

alter table public.subscription_price_events enable row level security;

drop policy if exists "Restaurant members can read own price events"
on public.subscription_price_events;
create policy "Restaurant members can read own price events"
on public.subscription_price_events for select
using (public.is_restaurant_member(subscription_price_events.restaurant_id));

drop policy if exists "Super admins can read all price events"
on public.subscription_price_events;
create policy "Super admins can read all price events"
on public.subscription_price_events for select
using (public.is_super_admin());

revoke all on table public.subscription_price_events from anon, authenticated;
grant select on table public.subscription_price_events to authenticated;

alter table public.payments
add column if not exists idempotency_key text;

update public.payments
set idempotency_key = 'legacy:' || id::text
where idempotency_key is null;

alter table public.payments
alter column idempotency_key set not null;

create unique index if not exists payments_idempotency_key_unique
on public.payments(idempotency_key);

alter table public.invoices
add column if not exists void_reason text,
add column if not exists voided_at timestamptz,
add column if not exists voided_by_user_id uuid references auth.users(id) on delete set null;

create or replace function public.issue_billing_invoice(
  p_restaurant_id uuid,
  p_subscription_id uuid,
  p_period_start date,
  p_period_end date,
  p_issued_date date,
  p_due_at timestamptz,
  p_subtotal numeric,
  p_vat_rate numeric,
  p_vat_amount numeric,
  p_total numeric,
  p_currency text,
  p_idempotency_key text,
  p_description text,
  p_description_ar text,
  p_quantity integer,
  p_unit_amount numeric,
  p_line_total numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $issue_billing_invoice$
declare
  v_invoice public.invoices%rowtype;
  v_invoice_number text;
begin
  if p_total < 0 or p_unit_amount < 0 or p_quantity <= 0 then
    raise exception 'Invoice values are invalid.';
  end if;

  if not exists (
    select 1 from public.subscriptions
    where id = p_subscription_id and restaurant_id = p_restaurant_id
  ) then
    raise exception 'Subscription not found for this restaurant.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  select * into v_invoice
  from public.invoices
  where idempotency_key = p_idempotency_key;

  if found then
    return to_jsonb(v_invoice);
  end if;

  v_invoice_number := public.next_invoice_number(extract(year from p_issued_date)::integer);

  insert into public.invoices (
    restaurant_id, subscription_id, invoice_number, period_start, period_end,
    subtotal, vat_rate, vat_amount, total, currency, status, issued_at, due_at,
    idempotency_key
  ) values (
    p_restaurant_id, p_subscription_id, v_invoice_number, p_period_start, p_period_end,
    p_subtotal, p_vat_rate, p_vat_amount, p_total, p_currency, 'issued',
    p_issued_date::timestamptz, p_due_at, p_idempotency_key
  ) returning * into v_invoice;

  insert into public.invoice_line_items (
    restaurant_id, invoice_id, description, description_ar,
    quantity, unit_amount, line_total
  ) values (
    p_restaurant_id, v_invoice.id, p_description, p_description_ar,
    p_quantity, p_unit_amount, p_line_total
  );

  return to_jsonb(v_invoice);
end;
$issue_billing_invoice$;

create or replace function public.record_billing_payment(
  p_restaurant_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_received_at timestamptz,
  p_actor_user_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $record_billing_payment$
declare
  v_invoice public.invoices%rowtype;
  v_subscription public.subscriptions%rowtype;
  v_payment public.payments%rowtype;
  v_paid numeric(10, 2);
  v_remaining numeric(10, 2);
begin
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'Payment request key is required.';
  end if;
  if p_method not in ('bank_transfer', 'cash', 'cheque', 'other') then
    raise exception 'Payment method is invalid.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  select * into v_payment
  from public.payments
  where idempotency_key = p_idempotency_key;

  if found then
    if v_payment.restaurant_id <> p_restaurant_id or v_payment.invoice_id <> p_invoice_id then
      raise exception 'Payment request key is already in use.';
    end if;
    return jsonb_build_object('payment_id', v_payment.id, 'duplicate', true);
  end if;

  if p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id and restaurant_id = p_restaurant_id
  for update;

  if not found then
    raise exception 'Invoice not found.';
  end if;
  if v_invoice.status <> 'issued' then
    raise exception 'Payments can only be recorded against an issued invoice.';
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where invoice_id = p_invoice_id and restaurant_id = p_restaurant_id;
  v_remaining := v_invoice.total - v_paid;

  if p_amount > v_remaining then
    raise exception 'Payment exceeds the remaining invoice balance of %.', v_remaining;
  end if;

  insert into public.payments (
    restaurant_id, invoice_id, amount, method, reference, received_at,
    recorded_by_user_id, idempotency_key
  ) values (
    p_restaurant_id, p_invoice_id, p_amount, p_method,
    nullif(btrim(p_reference), ''), coalesce(p_received_at, now()),
    p_actor_user_id, p_idempotency_key
  ) returning * into v_payment;

  if p_amount = v_remaining then
    update public.invoices
    set status = 'paid', paid_at = now()
    where id = p_invoice_id and restaurant_id = p_restaurant_id;

    select * into v_subscription
    from public.subscriptions
    where id = v_invoice.subscription_id and restaurant_id = p_restaurant_id
    for update;

    if found and v_subscription.status in ('past_due', 'suspended', 'trialing') then
      update public.subscriptions
      set status = 'active', grace_until = null
      where id = v_subscription.id and restaurant_id = p_restaurant_id;

      insert into public.subscription_status_events (
        restaurant_id, subscription_id, from_status, to_status, reason,
        actor_user_id, actor_role
      ) values (
        p_restaurant_id, v_subscription.id, v_subscription.status, 'active',
        'Invoice ' || v_invoice.invoice_number || ' settled',
        p_actor_user_id, 'super_admin'
      );
    end if;
  end if;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'duplicate', false,
    'remaining_balance', v_remaining - p_amount
  );
end;
$record_billing_payment$;

create or replace function public.void_billing_invoice(
  p_restaurant_id uuid,
  p_invoice_id uuid,
  p_reason text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $void_billing_invoice$
declare
  v_invoice public.invoices%rowtype;
  v_paid numeric(10, 2);
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A void reason is required.';
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id and restaurant_id = p_restaurant_id
  for update;

  if not found then
    raise exception 'Invoice not found.';
  end if;
  if v_invoice.status <> 'issued' then
    raise exception 'Only issued invoices can be voided.';
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where invoice_id = p_invoice_id and restaurant_id = p_restaurant_id;
  if v_paid > 0 then
    raise exception 'An invoice with recorded payments cannot be voided.';
  end if;

  update public.invoices
  set status = 'void', void_reason = btrim(p_reason), voided_at = now(),
      voided_by_user_id = p_actor_user_id
  where id = p_invoice_id and restaurant_id = p_restaurant_id;

  return jsonb_build_object('invoice_id', p_invoice_id, 'status', 'void');
end;
$void_billing_invoice$;

revoke all on function public.issue_billing_invoice(
  uuid, uuid, date, date, date, timestamptz, numeric, numeric, numeric,
  numeric, text, text, text, text, integer, numeric, numeric
) from public, anon, authenticated;
grant execute on function public.issue_billing_invoice(
  uuid, uuid, date, date, date, timestamptz, numeric, numeric, numeric,
  numeric, text, text, text, text, integer, numeric, numeric
) to service_role;

revoke all on function public.record_billing_payment(
  uuid, uuid, numeric, text, text, timestamptz, uuid, text
) from public, anon, authenticated;
grant execute on function public.record_billing_payment(
  uuid, uuid, numeric, text, text, timestamptz, uuid, text
) to service_role;

revoke all on function public.void_billing_invoice(uuid, uuid, text, uuid)
from public, anon, authenticated;
grant execute on function public.void_billing_invoice(uuid, uuid, text, uuid)
to service_role;

notify pgrst, 'reload schema';
