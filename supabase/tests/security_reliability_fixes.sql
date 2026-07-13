\set ON_ERROR_STOP on

-- July 2026 security/reliability regression tests. Rollback-only.
begin;

insert into public.restaurants (
  id, name, slug, whatsapp_number, status, is_active, accepting_orders
)
values (
  '81000000-0000-0000-0000-000000000001',
  'Review Fix Tenant',
  'review-fix-tenant',
  '971500000001',
  'live',
  true,
  true
);

insert into public.customers (
  id,
  restaurant_id,
  name,
  phone,
  delivery_area,
  delivery_address,
  marketing_opt_in,
  consent_order_processing,
  consent_marketing
)
values (
  '82000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001',
  'Existing Customer',
  '971500000222',
  '',
  '',
  false,
  true,
  false
);

do $consent_replay_test$
declare
  first_order_id uuid;
  replayed_order_id uuid;
begin
  first_order_id := public.create_order_with_customer_v4(
    '81000000-0000-0000-0000-000000000001',
    'Original Customer',
    '971500000111',
    'takeaway',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    'Cash on Delivery',
    '[{"item_id":"tea","name":"Tea","price":10,"quantity":1}]'::jsonb,
    10,
    0,
    10,
    'original message',
    true,
    false,
    now(),
    'review-fix-idempotency-token'
  );

  replayed_order_id := public.create_order_with_customer_v4(
    '81000000-0000-0000-0000-000000000001',
    'Existing Customer',
    '971500000222',
    'takeaway',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    'Cash on Delivery',
    '[{"item_id":"tea","name":"Tea","price":10,"quantity":1}]'::jsonb,
    10,
    0,
    10,
    'changed replay message',
    true,
    true,
    now(),
    'review-fix-idempotency-token'
  );

  if replayed_order_id <> first_order_id then
    raise exception 'Idempotent replay created a different order';
  end if;

  if (
    select consent_marketing or marketing_opt_in
    from public.customers
    where restaurant_id = '81000000-0000-0000-0000-000000000001'
      and phone = '971500000222'
  ) then
    raise exception 'Idempotent replay changed another customer consent';
  end if;

  if (
    select count(*)
    from public.orders
    where restaurant_id = '81000000-0000-0000-0000-000000000001'
  ) <> 1 then
    raise exception 'Idempotent replay created a duplicate order';
  end if;
end;
$consent_replay_test$;

do $rate_limit_test$
begin
  if not public.check_order_submission_rate_limit(
    '81000000-0000-0000-0000-000000000001',
    'review-fingerprint',
    2,
    600
  ) then
    raise exception 'First rate-limited request was unexpectedly rejected';
  end if;

  if not public.check_order_submission_rate_limit(
    '81000000-0000-0000-0000-000000000001',
    'review-fingerprint',
    2,
    600
  ) then
    raise exception 'Second rate-limited request was unexpectedly rejected';
  end if;

  if public.check_order_submission_rate_limit(
    '81000000-0000-0000-0000-000000000001',
    'review-fingerprint',
    2,
    600
  ) then
    raise exception 'Rate limit allowed a request above the limit';
  end if;
end;
$rate_limit_test$;

do $invite_schema_test$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'restaurant_users'
      and column_name = 'password_setup_token_hash'
  ) then
    raise exception 'Invitation password setup token column is missing';
  end if;
end;
$invite_schema_test$;

rollback;
