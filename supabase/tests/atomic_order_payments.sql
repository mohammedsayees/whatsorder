-- Rollback-only integration checks. Run after all migrations with ON_ERROR_STOP.
begin;
insert into auth.users (id, email, role, aud, created_at, updated_at)
values ('17000000-0000-0000-0000-000000000001', 'payment@test.invalid',
  'authenticated', 'authenticated', now(), now());
insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active)
values ('27000000-0000-0000-0000-000000000001', 'Payment test', 'payment-test', '971500000071', 'live', true);
insert into public.restaurant_users (restaurant_id, user_id, email, role, accepted_at)
values ('27000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000001',
  'payment@test.invalid', 'staff', now());
insert into public.restaurant_shifts (id, restaurant_id, shift_name, opening_cash_amount, opened_by_user_id)
values ('87000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001',
  'Payment shift', 0, '17000000-0000-0000-0000-000000000001');
insert into public.orders (id, restaurant_id, customer_name, customer_phone,
  fulfilment_type, payment_method, items, subtotal, delivery_fee, total, status,
  whatsapp_message, consent_order_processing, consent_timestamp)
values ('47000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001',
  'Payment test', '971500000072', 'takeaway', null,
  '[{"item_id":"tea","name":"Tea","price":5,"quantity":1}]', 5, 0, 5,
  'New', 'test', true, now());

create function pg_temp.payment_call(method text, complete_it boolean)
returns jsonb language sql as $$
  select public.record_order_payment('27000000-0000-0000-0000-000000000001',
    '47000000-0000-0000-0000-000000000001', method, complete_it,
    '17000000-0000-0000-0000-000000000001');
$$;

do $checks$
declare result jsonb;
begin
  -- A rejected completion must roll back both payment and its audit insert.
  begin
    perform pg_temp.payment_call('Cash on Delivery', true);
    raise exception 'Expected invalid transition';
  exception when others then
    if sqlerrm not like '%Invalid order status transition%' then raise; end if;
  end;
  if exists (select 1 from public.orders where id = '47000000-0000-0000-0000-000000000001'
      and payment_method is not null)
     or exists (select 1 from public.order_payment_events
       where order_id = '47000000-0000-0000-0000-000000000001') then
    raise exception 'Rejected completion left partial payment or audit';
  end if;

  -- Country validation runs before any mutation.
  begin
    perform pg_temp.payment_call('UPI', true);
    raise exception 'Expected UAE UPI rejection';
  exception when others then
    if sqlerrm <> 'Invalid payment request' then raise; end if;
  end;

  update public.orders set status = 'Preparing'
  where id = '47000000-0000-0000-0000-000000000001';
  result := pg_temp.payment_call('Cash on Delivery', true);
  if (result->>'changed')::boolean is distinct from true then
    raise exception 'Completion did not report a change';
  end if;
  if not exists (select 1 from public.orders
      where id = '47000000-0000-0000-0000-000000000001'
        and payment_method = 'Cash on Delivery' and status = 'Completed') then
    raise exception 'Payment and completion were not saved';
  end if;

  result := pg_temp.payment_call('Cash on Delivery', true);
  if (result->>'changed')::boolean is distinct from false then
    raise exception 'Completion replay was not idempotent';
  end if;
  if (select count(*) from public.order_payment_events
      where order_id = '47000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'Replay duplicated payment audit';
  end if;
  if (select count(*) from public.order_status_events
      where order_id = '47000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'Replay duplicated status event';
  end if;

  begin
    perform pg_temp.payment_call('Card on Delivery', true);
    raise exception 'Expected conflicting payment rejection';
  exception when others then
    if sqlerrm <> 'A different payment method is already recorded' then raise; end if;
  end;

  -- A different tenant cannot address this order, even with a valid actor there.
  begin
    perform public.record_order_payment('27000000-0000-0000-0000-000000000002',
      '47000000-0000-0000-0000-000000000001', 'Cash on Delivery', true,
      '17000000-0000-0000-0000-000000000001');
    raise exception 'Expected membership rejection';
  exception when others then
    if sqlerrm <> 'Restaurant membership required' then raise; end if;
  end;

  update public.restaurant_shifts set status = 'closed', closed_at = now(),
    closed_by_user_id = '17000000-0000-0000-0000-000000000001',
    cash_counted_amount = 5, expected_cash_amount = 5, difference_amount = 0
  where id = '87000000-0000-0000-0000-000000000001';
  begin
    perform pg_temp.payment_call('Card on Delivery', false);
    raise exception 'Expected closed-shift rejection';
  exception when others then
    if sqlerrm <> 'Only management can correct a closed shift payment' then raise; end if;
  end;
  update public.restaurant_users set role = 'manager'
  where restaurant_id = '27000000-0000-0000-0000-000000000001';
  perform pg_temp.payment_call('Card on Delivery', false);
  if not exists (select 1 from public.order_payment_events
      where order_id = '47000000-0000-0000-0000-000000000001'
        and from_method = 'Cash on Delivery' and to_method = 'Card on Delivery'
        and actor_role = 'manager') then
    raise exception 'Correction audit did not capture the previous method and live role';
  end if;
end;
$checks$;

-- Force the audit write to fail: correction must not survive that failure.
create function pg_temp.reject_payment_audit() returns trigger language plpgsql as $$
begin raise exception 'Injected audit failure'; end;
$$;
create trigger test_reject_payment_audit before insert on public.order_payment_events
for each row execute function pg_temp.reject_payment_audit();
do $$
begin
  begin
    perform pg_temp.payment_call('Cash on Delivery', false);
    raise exception 'Expected audit failure';
  exception when others then
    if sqlerrm <> 'Injected audit failure' then raise; end if;
  end;
  if not exists (select 1 from public.orders
      where id = '47000000-0000-0000-0000-000000000001' and payment_method = 'Card on Delivery') then
    raise exception 'Payment survived failed audit';
  end if;
end;
$$;

do $$
begin
  if has_function_privilege('anon', 'public.record_order_payment(uuid,uuid,text,boolean,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.record_order_payment(uuid,uuid,text,boolean,uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.record_order_payment(uuid,uuid,text,boolean,uuid)', 'execute') then
    raise exception 'Payment RPC privileges are incorrect';
  end if;
end;
$$;
rollback;
