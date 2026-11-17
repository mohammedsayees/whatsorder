begin;
insert into public.restaurants(id,name,slug,whatsapp_number,status,is_active)
values('2c000000-0000-0000-0000-000000000001','Rider A','rider-a','971500000096','live',true),
('2c000000-0000-0000-0000-000000000002','Rider B','rider-b','971500000097','live',true);
insert into public.orders(id,restaurant_id,customer_name,customer_phone,fulfilment_type,items,subtotal,delivery_fee,total,status,whatsapp_message,consent_order_processing,consent_timestamp)
values('4c000000-0000-4000-8000-000000000001','2c000000-0000-0000-0000-000000000001','Cust','971500000096','delivery','[]',5,0,5,'Out for Delivery','t',true,now());
insert into public.delivery_riders(id,restaurant_id,name,phone)
values('6c000000-0000-4000-8000-000000000001','2c000000-0000-0000-0000-000000000001','Ravi','971501234567');
insert into public.order_rider_assignments(id,restaurant_id,order_id,rider_id,tracking_token_hash)
values('7c000000-0000-4000-8000-000000000001','2c000000-0000-0000-0000-000000000001','4c000000-0000-4000-8000-000000000001','6c000000-0000-4000-8000-000000000001',repeat('b',64));

insert into public.rider_live_locations(assignment_id,restaurant_id,order_id,latitude,longitude,accuracy_m)
values('7c000000-0000-4000-8000-000000000001','2c000000-0000-0000-0000-000000000001','4c000000-0000-4000-8000-000000000001',25.4,55.5,12);

do $$ begin
  -- One row per assignment: a second position must update, not add.
  begin
    insert into public.rider_live_locations(assignment_id,restaurant_id,order_id,latitude,longitude)
    values('7c000000-0000-4000-8000-000000000001','2c000000-0000-0000-0000-000000000001','4c000000-0000-4000-8000-000000000001',25.5,55.6);
    raise exception 'Second row for the same assignment accepted';
  exception when unique_violation then null; end;
  -- Location cannot point at another restaurant's order.
  begin
    insert into public.rider_live_locations(assignment_id,restaurant_id,order_id,latitude,longitude)
    values('7c000000-0000-4000-8000-000000000001','2c000000-0000-0000-0000-000000000002','4c000000-0000-4000-8000-000000000001',1,1);
    raise exception 'Cross-tenant location accepted';
  exception when unique_violation or foreign_key_violation then null; end;
  begin
    update public.rider_live_locations set latitude=200 where assignment_id='7c000000-0000-4000-8000-000000000001';
    raise exception 'Impossible latitude accepted';
  exception when check_violation then null; end;
  begin
    insert into public.order_rider_assignments(restaurant_id,order_id,rider_id,tracking_token_hash)
    values('2c000000-0000-0000-0000-000000000001','4c000000-0000-4000-8000-000000000001','6c000000-0000-4000-8000-000000000001',repeat('b',64));
    raise exception 'Duplicate tracking token accepted';
  exception when unique_violation then null; end;
  begin
    update public.order_rider_assignments set tracking_token_hash='plain-secret' where id='7c000000-0000-4000-8000-000000000001';
    raise exception 'Unhashed tracking token accepted';
  exception when check_violation then null; end;
  if has_table_privilege('anon','public.rider_live_locations','select')
     or has_table_privilege('anon','public.rider_live_locations','insert')
     or has_table_privilege('authenticated','public.rider_live_locations','insert')
     or has_table_privilege('authenticated','public.rider_live_locations','update') then
    raise exception 'Browsers must not read anonymously or write rider locations';
  end if;
end $$;

-- Deleting the order removes the rider's position.
delete from public.order_rider_assignments where id='7c000000-0000-4000-8000-000000000001';
do $$ begin
  if exists(select 1 from public.rider_live_locations where assignment_id='7c000000-0000-4000-8000-000000000001') then
    raise exception 'Location survived its assignment';
  end if;
end $$;
rollback;
