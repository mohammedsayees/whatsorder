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


do $$
declare first_job public.order_notification_jobs; second_job public.order_notification_jobs; token uuid;
begin
  perform public.transition_order_status_async('27000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000001','Accepted','17000000-0000-0000-0000-000000000001','staff',null);
  if (select count(*) from public.order_notification_jobs where order_id='47000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'Status event must enqueue both channels';
  end if;
  if exists(select * from public.claim_order_notification('27000000-0000-0000-0000-000000000099')) then
    raise exception 'Claim crossed tenant boundary';
  end if;
  select * into first_job from public.claim_order_notification('27000000-0000-0000-0000-000000000001');
  select * into second_job from public.claim_order_notification('27000000-0000-0000-0000-000000000001');
  if first_job.id=second_job.id or first_job.attempts<>1 or first_job.lease_token is null then
    raise exception 'Claims did not isolate work';
  end if;
  if exists(select * from public.claim_order_notification('27000000-0000-0000-0000-000000000001')) then
    raise exception 'Unexpired lease was reclaimed';
  end if;
  update public.order_notification_jobs set lease_until=now()-interval '1 minute' where id=first_job.id;
  select * into second_job from public.claim_order_notification('27000000-0000-0000-0000-000000000001');
  if second_job.id<>first_job.id or second_job.attempts<>2 or second_job.lease_token=first_job.lease_token then
    raise exception 'Expired lease was not safely reclaimed';
  end if;
  update public.order_notification_jobs set status='accepted' where id=first_job.id and lease_token=first_job.lease_token;
  if found then raise exception 'Stale owner overwrote new lease'; end if;
  update public.order_notification_jobs set attempts=5,lease_until=now()-interval '1 minute' where id=second_job.id;
  perform public.claim_order_notification('27000000-0000-0000-0000-000000000001');
  if not exists(select 1 from public.order_notification_jobs where id=second_job.id and status='failed') then
    raise exception 'Exhausted lease not marked failed';
  end if;
  token:=public.claim_daily_summary('27000000-0000-0000-0000-000000000001','2026-09-06');
  if token is null or public.claim_daily_summary('27000000-0000-0000-0000-000000000001','2026-09-06') is not null then
    raise exception 'Daily summary claimed twice';
  end if;
  update public.daily_summary_runs set status='failed' where lease_token=token;
  if public.claim_daily_summary('27000000-0000-0000-0000-000000000001','2026-09-06') is null then
    raise exception 'Failed summary not retryable';
  end if;
  if has_function_privilege('authenticated','public.claim_order_notification(uuid)','execute')
     or has_table_privilege('authenticated','public.order_notification_jobs','update') then
    raise exception 'Browser roles can mutate notification jobs';
  end if;
  begin
    insert into public.order_status_events(restaurant_id,order_id,to_status,from_status)
    values('27000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000001','Cancelled','Accepted');
    raise exception using errcode='P9999',message='rollback fixture';
  exception when sqlstate 'P9999' then null;
  end;
  if exists(select 1 from public.order_notification_jobs where order_status='Cancelled') then
    raise exception 'Rolled back event left delivery jobs';
  end if;
end $$;
rollback;
