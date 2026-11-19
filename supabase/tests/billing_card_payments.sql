begin;
insert into public.restaurants(id,name,slug,whatsapp_number,status,is_active)
values('2f100000-0000-0000-0000-000000000001','Card A','card-a','971500000061','live',true);

insert into public.subscriptions (id, restaurant_id, plan_id, status, billing_cycle_start, billing_cycle_end, grace_until)
select '5f100000-0000-0000-0000-000000000001', '2f100000-0000-0000-0000-000000000001', plan.id, 'past_due', current_date, current_date + 30, current_date + 3
from public.plans plan where plan.code = 'starter' limit 1;

insert into public.invoices (id, restaurant_id, subscription_id, invoice_number, period_start, period_end, subtotal, total, status, issued_at, due_at, idempotency_key)
values ('6f100000-0000-0000-0000-000000000001', '2f100000-0000-0000-0000-000000000001', '5f100000-0000-0000-0000-000000000001',
  'WO-TEST-CARD-1', current_date, current_date + 30, 149, 149, 'issued', now(), now(), 'card-test-1');

do $billing_card_test$
declare
  result jsonb;
begin
  result := public.record_billing_payment(
    '2f100000-0000-0000-0000-000000000001', '6f100000-0000-0000-0000-000000000001',
    149, 'card', 'pi_test_123', now(), null, 'stripe:pi_test_123');
  if (result->>'duplicate')::boolean then raise exception 'First card payment reported as duplicate'; end if;

  if (select status::text from public.invoices where id='6f100000-0000-0000-0000-000000000001') <> 'paid'
     or (select status::text from public.subscriptions where id='5f100000-0000-0000-0000-000000000001') <> 'active' then
    raise exception 'Card payment did not settle the invoice and reactivate the subscription';
  end if;
  if not exists (select 1 from public.subscription_status_events
                 where subscription_id='5f100000-0000-0000-0000-000000000001' and actor_role='stripe') then
    raise exception 'Card settlement must be audited as Stripe';
  end if;

  -- Webhook + autopay both record the same PaymentIntent: one payment only.
  result := public.record_billing_payment(
    '2f100000-0000-0000-0000-000000000001', '6f100000-0000-0000-0000-000000000001',
    149, 'card', 'pi_test_123', now(), null, 'stripe:pi_test_123');
  if not (result->>'duplicate')::boolean
     or (select count(*) from public.payments where invoice_id='6f100000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'Duplicate card payment recorded';
  end if;

  begin
    perform public.record_billing_payment(
      '2f100000-0000-0000-0000-000000000001', '6f100000-0000-0000-0000-000000000001',
      1, 'crypto', null, now(), null, 'bad-method');
    raise exception 'Unknown payment method accepted';
  exception when raise_exception then
    if sqlerrm not like 'Payment method is invalid%' then raise; end if;
  end;

  insert into public.restaurant_billing_cards(restaurant_id, stripe_customer_id, livemode)
  values ('2f100000-0000-0000-0000-000000000001', 'cus_TestAAAAAAAA', false);

  begin
    update public.restaurant_billing_cards set autopay_enabled = true
    where restaurant_id='2f100000-0000-0000-0000-000000000001';
    raise exception 'Autopay enabled without a saved card and consent';
  exception when check_violation then null; end;

  update public.restaurant_billing_cards
  set payment_method_id='pm_TestAAAAAAAA', card_brand='visa', card_last4='4242', card_exp_month=12, card_exp_year=2030,
      autopay_enabled=true, autopay_consented_at=now()
  where restaurant_id='2f100000-0000-0000-0000-000000000001';

  begin
    update public.restaurant_billing_cards set card_last4='4242424242424242'
    where restaurant_id='2f100000-0000-0000-0000-000000000001';
    raise exception 'Full card number accepted';
  exception when check_violation then null; end;

  if has_table_privilege('anon','public.restaurant_billing_cards','select')
     or has_table_privilege('authenticated','public.restaurant_billing_cards','insert')
     or has_table_privilege('authenticated','public.restaurant_billing_cards','update') then
    raise exception 'Browsers must not write (or anonymously read) billing cards';
  end if;
end
$billing_card_test$;
rollback;
