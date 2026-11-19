-- Card payments and autopay for WhatsOrder's own invoices (Stripe, platform
-- account). The existing billing engine stays the source of truth: Stripe
-- only collects money, and every card payment is recorded through
-- record_billing_payment like a bank transfer (idempotent per PaymentIntent).
--
-- * restaurant_billing_cards: the restaurant's Stripe Customer and, once
--   saved, its card (brand/last4/expiry only, never card numbers) and the
--   owner's autopay consent. Service-role writes; tenant members can read.
-- * payments.method gains 'card'.
-- * invoices gain autopay attempt tracking (max attempts enforced in code).

create table if not exists public.restaurant_billing_cards (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  stripe_customer_id text not null unique
    check (stripe_customer_id ~ '^cus_[A-Za-z0-9]{6,64}$'),
  livemode boolean not null,
  payment_method_id text
    check (payment_method_id is null or payment_method_id ~ '^pm_[A-Za-z0-9]{6,64}$'),
  card_brand text,
  card_last4 text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  card_exp_month integer check (card_exp_month is null or card_exp_month between 1 and 12),
  card_exp_year integer check (card_exp_year is null or card_exp_year between 2000 and 2200),
  autopay_enabled boolean not null default false,
  autopay_consented_at timestamptz,
  autopay_consented_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Autopay needs a saved card and a recorded consent.
  constraint restaurant_billing_cards_autopay_needs_card
    check (not autopay_enabled or (payment_method_id is not null and autopay_consented_at is not null))
);

alter table public.restaurant_billing_cards enable row level security;

drop policy if exists restaurant_billing_cards_tenant_read on public.restaurant_billing_cards;
create policy restaurant_billing_cards_tenant_read
on public.restaurant_billing_cards
for select
to authenticated
using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

revoke all on public.restaurant_billing_cards from public, anon, authenticated;
grant select on public.restaurant_billing_cards to authenticated;
grant all on public.restaurant_billing_cards to service_role;

alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments
  add constraint payments_method_check
  check (method in ('bank_transfer', 'cash', 'cheque', 'other', 'card'));

alter table public.invoices
  add column if not exists autopay_attempts integer not null default 0,
  add column if not exists autopay_last_attempt_at timestamptz,
  add column if not exists autopay_last_error text;

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
  if p_method not in ('bank_transfer', 'cash', 'cheque', 'other', 'card') then
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
        p_actor_user_id, case when p_method = 'card' then 'stripe' else 'super_admin' end
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
