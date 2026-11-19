-- Online order payments (Stripe Connect direct charges, PR 2 of 2).
--
-- A customer who chooses "Pay online" gets an unpaid order (payment_method
-- null, as for kitchen tickets) and is sent to a Stripe Checkout page on the
-- restaurant's own Stripe account. The signed Stripe webhook then marks the
-- order paid with payment_method = 'Online Payment'.
--
-- Shift and business-day cash summaries bucket only the methods they list
-- (cash/card/UPI/credit), so online payments are never counted as cash in
-- the drawer.

alter type public.payment_method add value if not exists 'Online Payment';

alter table public.orders
  add column if not exists online_payment_status text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists online_paid_at timestamptz;

do $online_payment_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass and conname = 'orders_online_payment_status_values'
  ) then
    alter table public.orders
      add constraint orders_online_payment_status_values
      check (online_payment_status is null
        or online_payment_status in ('pending', 'paid', 'expired', 'failed', 'refunded'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass and conname = 'orders_stripe_checkout_session_format'
  ) then
    alter table public.orders
      add constraint orders_stripe_checkout_session_format
      check (stripe_checkout_session_id is null or stripe_checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9]+$');
  end if;
end
$online_payment_constraints$;

create unique index if not exists orders_stripe_checkout_session
on public.orders(stripe_checkout_session_id)
where stripe_checkout_session_id is not null;

-- Guard: an order counts as paid online only when Stripe confirmed it, and
-- a paid-online order can never be re-recorded as cash, card, UPI or credit
-- (for example by a "Complete · Cash" tap or a payment-method correction).
-- Compares as text so it does not depend on the new enum value at creation.
create or replace function public.guard_online_order_payment()
returns trigger
language plpgsql
set search_path = public
as $guard_online_payment$
begin
  if new.payment_method::text = 'Online Payment'
     and new.online_payment_status is distinct from 'paid'
     and new.online_payment_status is distinct from 'refunded' then
    raise exception 'Online Payment requires a confirmed online payment';
  end if;

  if tg_op = 'UPDATE'
     and old.online_payment_status in ('paid', 'refunded')
     and new.payment_method::text is distinct from 'Online Payment' then
    raise exception 'This order was paid online; its payment method cannot be changed';
  end if;

  return new;
end
$guard_online_payment$;

drop trigger if exists orders_guard_online_payment on public.orders;
create trigger orders_guard_online_payment
before insert or update of payment_method, online_payment_status on public.orders
for each row execute function public.guard_online_order_payment();

revoke all on function public.guard_online_order_payment() from public, anon, authenticated;
