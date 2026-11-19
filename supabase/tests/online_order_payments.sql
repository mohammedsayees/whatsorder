begin;
insert into public.restaurants(id,name,slug,whatsapp_number,status,is_active)
values('2e000000-0000-0000-0000-000000000001','Online A','online-a','971500000081','live',true);
insert into public.orders(id,restaurant_id,customer_name,customer_phone,fulfilment_type,items,subtotal,delivery_fee,total,status,whatsapp_message,consent_order_processing,consent_timestamp,payment_method,online_payment_status,stripe_checkout_session_id)
values('4e000000-0000-4000-8000-000000000001','2e000000-0000-0000-0000-000000000001','Online','971500000081','takeaway','[]',18,0,18,'New','t',true,now(),null,'pending','cs_test_AAAAAAAAAAAAAAAA');

do $$ begin
  -- Cannot mark Online Payment before Stripe confirms.
  begin
    update public.orders set payment_method='Online Payment' where id='4e000000-0000-4000-8000-000000000001';
    raise exception 'Unconfirmed online payment accepted';
  exception when raise_exception then
    if sqlerrm not like 'Online Payment requires%' then raise; end if;
  end;

  -- The webhook path: confirmed and recorded together.
  update public.orders set online_payment_status='paid', payment_method='Online Payment', online_paid_at=now()
  where id='4e000000-0000-4000-8000-000000000001';

  -- A paid-online order can't be re-recorded as cash.
  begin
    update public.orders set payment_method='Cash on Delivery' where id='4e000000-0000-4000-8000-000000000001';
    raise exception 'Paid-online order switched to cash';
  exception when raise_exception then
    if sqlerrm not like 'This order was paid online%' then raise; end if;
  end;

  -- Completing keeps the online payment.
  update public.orders set status='Completed' where id='4e000000-0000-4000-8000-000000000001';
  if (select payment_method::text from public.orders where id='4e000000-0000-4000-8000-000000000001') <> 'Online Payment' then
    raise exception 'Completion lost the online payment';
  end if;

  -- Refunds keep the method.
  update public.orders set online_payment_status='refunded' where id='4e000000-0000-4000-8000-000000000001';

  begin
    update public.orders set online_payment_status='captured' where id='4e000000-0000-4000-8000-000000000001';
    raise exception 'Unknown online payment status accepted';
  exception when check_violation or raise_exception then
    if sqlerrm like 'Unknown online%' then raise; end if;
  end;

  begin
    insert into public.orders(restaurant_id,customer_name,customer_phone,fulfilment_type,items,subtotal,delivery_fee,total,status,whatsapp_message,consent_order_processing,consent_timestamp,stripe_checkout_session_id)
    values('2e000000-0000-0000-0000-000000000001','Dup','971500000081','takeaway','[]',1,0,1,'New','t',true,now(),'cs_test_AAAAAAAAAAAAAAAA');
    raise exception 'Duplicate Checkout Session accepted';
  exception when unique_violation then null; end;

  begin
    update public.orders set stripe_checkout_session_id='pi_123' where id='4e000000-0000-4000-8000-000000000001';
    raise exception 'Malformed Checkout Session id accepted';
  exception when check_violation then null; end;

  -- Ordinary cash orders are unaffected.
  insert into public.orders(restaurant_id,customer_name,customer_phone,fulfilment_type,items,subtotal,delivery_fee,total,status,whatsapp_message,consent_order_processing,consent_timestamp,payment_method)
  values('2e000000-0000-0000-0000-000000000001','Cash','971500000081','takeaway','[]',5,0,5,'Completed','t',true,now(),'Cash on Delivery');
end $$;
rollback;
