-- Rollback-only customer credit integration checks. Run after all migrations.
begin;

insert into auth.users (id, email, role, aud, created_at, updated_at)
values ('19000000-0000-0000-0000-000000000001', 'credit@test.invalid',
  'authenticated', 'authenticated', now(), now());
insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active)
values ('29000000-0000-0000-0000-000000000001', 'Credit test',
  'credit-test', '971500000091', 'live', true);
insert into public.restaurant_users (restaurant_id, user_id, email, role, accepted_at)
values ('29000000-0000-0000-0000-000000000001',
  '19000000-0000-0000-0000-000000000001', 'credit@test.invalid',
  'manager', now());
insert into public.restaurant_shifts (
  id, restaurant_id, shift_name, opening_cash_amount, opened_by_user_id
) values (
  '89000000-0000-0000-0000-000000000001',
  '29000000-0000-0000-0000-000000000001', 'Credit shift', 0,
  '19000000-0000-0000-0000-000000000001'
);
insert into public.customers (
  id, restaurant_id, name, phone, delivery_area, delivery_address,
  consent_order_processing, consent_timestamp
) values (
  '59000000-0000-0000-0000-000000000001',
  '29000000-0000-0000-0000-000000000001', 'Credit Customer',
  '971500000092', '', '', true, now()
);

select public.configure_customer_credit_account(
  '29000000-0000-0000-0000-000000000001',
  '59000000-0000-0000-0000-000000000001', true, 50, 7, true, 0,
  '19000000-0000-0000-0000-000000000001'
);

insert into public.orders (
  id, restaurant_id, customer_name, customer_phone, fulfilment_type,
  payment_method, items, subtotal, delivery_fee, total, status,
  whatsapp_message, consent_order_processing, consent_timestamp
) values (
  '49000000-0000-0000-0000-000000000001',
  '29000000-0000-0000-0000-000000000001', 'Credit Customer',
  '971500000092', 'takeaway', null,
  '[{"item_id":"tea","name":"Tea","price":10,"quantity":1}]',
  10, 0, 10, 'Preparing', 'test', true, now()
), (
  '49000000-0000-0000-0000-000000000002',
  '29000000-0000-0000-0000-000000000001', 'Credit Customer',
  '971500000092', 'takeaway', null,
  '[{"item_id":"tea","name":"Tea","price":100,"quantity":1}]',
  100, 0, 100, 'Preparing', 'test', true, now()
);

do $credit_checks$
declare
  result jsonb;
  created_customer_id uuid;
  saved_account_id uuid;
  payment_entry_id uuid;
begin
  result := public.record_customer_credit_order(
    '29000000-0000-0000-0000-000000000001',
    '49000000-0000-0000-0000-000000000001',
    '19000000-0000-0000-0000-000000000001'
  );
  if (result->>'changed')::boolean is distinct from true then
    raise exception 'Credit completion did not report a change';
  end if;
  if not exists (
    select 1 from public.orders where id = '49000000-0000-0000-0000-000000000001'
      and payment_method::text = 'Customer Credit' and status = 'Completed'
  ) then
    raise exception 'Credit order was not completed';
  end if;
  if (select count(*) from public.customer_credit_entries
      where order_id = '49000000-0000-0000-0000-000000000001'
        and entry_type = 'charge' and amount = 10) <> 1 then
    raise exception 'Credit charge was not recorded exactly once';
  end if;

  result := public.record_customer_credit_order(
    '29000000-0000-0000-0000-000000000001',
    '49000000-0000-0000-0000-000000000001',
    '19000000-0000-0000-0000-000000000001'
  );
  if (result->>'changed')::boolean is distinct from false then
    raise exception 'Credit completion replay was not idempotent';
  end if;

  begin
    perform public.record_customer_credit_order(
      '29000000-0000-0000-0000-000000000001',
      '49000000-0000-0000-0000-000000000002',
      '19000000-0000-0000-0000-000000000001'
    );
    raise exception 'Expected credit-limit rejection';
  exception when others then
    if sqlerrm <> 'Customer credit limit exceeded' then raise; end if;
  end;
  if exists (
    select 1 from public.orders where id = '49000000-0000-0000-0000-000000000002'
      and payment_method is not null
  ) then
    raise exception 'Rejected credit order left a payment method behind';
  end if;

  payment_entry_id := public.record_customer_credit_payment(
    '29000000-0000-0000-0000-000000000001',
    '59000000-0000-0000-0000-000000000001', 4, 'cash', 'Part payment',
    '19000000-0000-0000-0000-000000000001'
  );
  if not exists (
    select 1 from public.shift_other_income_entries
    where restaurant_id = '29000000-0000-0000-0000-000000000001'
      and customer_credit_entry_id = payment_entry_id
      and category = 'customer_credit_repayment' and amount = 4
  ) then
    raise exception 'Credit payment was not reconciled into the open shift';
  end if;

  begin
    update public.customer_credit_entries set amount = -5 where id = payment_entry_id;
    raise exception 'Expected immutable-ledger rejection';
  exception when others then
    if sqlerrm <> 'Customer credit ledger entries are immutable' then raise; end if;
  end;
  begin
    update public.shift_other_income_entries set voided_at = now()
    where customer_credit_entry_id = payment_entry_id;
    raise exception 'Expected protected receipt rejection';
  exception when others then
    if sqlerrm <> 'Customer credit receipts must be corrected from the credit ledger' then raise; end if;
  end;

  select id into saved_account_id from public.customer_credit_accounts
  where customer_id = '59000000-0000-0000-0000-000000000001';
  if (select coalesce(sum(amount), 0) from public.customer_credit_entries
      where account_id = saved_account_id) <> 6 then
    raise exception 'Credit balance after payment is incorrect';
  end if;

  created_customer_id := public.create_credit_customer_account(
    '29000000-0000-0000-0000-000000000001', 'New Credit Customer',
    '971500000093', 100, 14, true, 25,
    '19000000-0000-0000-0000-000000000001'
  );
  if not exists (
    select 1 from public.customers where id = created_customer_id
      and restaurant_id = '29000000-0000-0000-0000-000000000001'
      and consent_order_processing and not consent_marketing
      and not marketing_opt_in
  ) then
    raise exception 'New credit customer consent flags are incorrect';
  end if;
  if not exists (
    select 1 from public.customer_credit_accounts account
    join public.customer_credit_entries entry on entry.account_id = account.id
    where account.customer_id = created_customer_id and account.credit_limit = 100
      and entry.entry_type = 'adjustment' and entry.amount = 25
  ) then
    raise exception 'New credit account or opening balance is missing';
  end if;
end;
$credit_checks$;

do $credit_privileges$
begin
  if has_function_privilege(
      'anon', 'public.record_customer_credit_order(uuid,uuid,uuid)', 'execute'
    ) or has_function_privilege(
      'authenticated', 'public.record_customer_credit_order(uuid,uuid,uuid)', 'execute'
    ) or not has_function_privilege(
      'service_role', 'public.record_customer_credit_order(uuid,uuid,uuid)', 'execute'
    ) then
    raise exception 'Customer credit RPC privileges are incorrect';
  end if;
end;
$credit_privileges$;

rollback;
