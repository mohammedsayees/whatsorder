begin;
insert into public.restaurants(id,name,slug,whatsapp_number,status,is_active)
values('2a000000-0000-0000-0000-000000000001','Arrival test','arrival-test','971500000093','live',true);
insert into public.orders(id,restaurant_id,customer_name,customer_phone,fulfilment_type,car_plate_number,items,subtotal,delivery_fee,total,status,whatsapp_message,consent_order_processing,consent_timestamp)
values('4a000000-0000-4000-8000-000000000001','2a000000-0000-0000-0000-000000000001','Car','971500000093','car_pickup','AJM 12345','[]',5,0,5,'Preparing','t',true,now());

do $$ declare clock_before timestamptz;
begin
  if (select customer_arrived_at from public.orders where id='4a000000-0000-4000-8000-000000000001') is not null then
    raise exception 'New orders must start without an arrival';
  end if;
  select status_started_at into clock_before from public.orders where id='4a000000-0000-4000-8000-000000000001';
  update public.orders set customer_arrived_at=now(), customer_arrival_note='Bay 3'
  where id='4a000000-0000-4000-8000-000000000001';
  if (select status_started_at from public.orders where id='4a000000-0000-4000-8000-000000000001') <> clock_before then
    raise exception 'Marking arrival must not reset the kitchen stage clock';
  end if;
  begin
    update public.orders set customer_arrival_note=repeat('x', 81) where id='4a000000-0000-4000-8000-000000000001';
    raise exception 'Overlong arrival note accepted';
  exception when check_violation then null; end;
  if to_regclass('public.idx_orders_waiting_car_arrivals') is null then
    raise exception 'Waiting-arrivals index missing';
  end if;
  if has_column_privilege('anon','public.orders','customer_arrived_at','update')
     or has_column_privilege('authenticated','public.orders','customer_arrived_at','update') then
    raise exception 'Browsers must not write arrivals directly';
  end if;
end $$;
rollback;
