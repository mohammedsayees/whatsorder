begin;
insert into public.restaurants(id,name,slug,whatsapp_number,status,is_active)
values('28000000-0000-0000-0000-000000000001','Billing test','billing-test','971500000078','live',true);
insert into public.menu_categories(id,restaurant_id,name,is_active)
values('38000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000001','Tea',true);
insert into public.menu_items(id,restaurant_id,category_id,name,price,is_available,staff_only)
values('58000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000001','Staff tea',5,true,true),
('58000000-0000-0000-0000-000000000002','28000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000001','Public tea',5,true,false);
set local role anon;
do $$ begin
  if exists(select 1 from public.menu_items where id='58000000-0000-0000-0000-000000000001') then raise exception 'Staff item leaked to customer'; end if;
  if not exists(select 1 from public.menu_items where id='58000000-0000-0000-0000-000000000002') then raise exception 'Existing public menu hidden'; end if;
end $$;
reset role;
insert into public.orders(id,restaurant_id,customer_name,customer_phone,fulfilment_type,items,subtotal,delivery_fee,total,status,whatsapp_message,consent_order_processing,consent_timestamp,created_at)
values('48000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000001','Clock test','971500000078','delivery','[]',5,0,5,'New','test',true,now(),now()-interval '10 minutes'),
('48000000-0000-0000-0000-000000000002','28000000-0000-0000-0000-000000000001','Clock test','971500000078','takeaway','[]',5,0,5,'New','test',true,now(),now()-interval '5 minutes');
do $$ declare clock_before timestamptz; stopped_at timestamptz; page jsonb;
begin
  select status_started_at into clock_before from public.orders where id='48000000-0000-0000-0000-000000000001';
  update public.orders set notes='Unrelated edit' where id='48000000-0000-0000-0000-000000000001';
  if (select status_started_at from public.orders where id='48000000-0000-0000-0000-000000000001') <> clock_before then raise exception 'Edit reset clock'; end if;
  page:=public.get_admin_orders_page_v2('28000000-0000-0000-0000-000000000001','active','all',1,1,'overdue');
  if page->'items'->0->>'id' <> '48000000-0000-0000-0000-000000000002' then raise exception 'Priority must sort all rows before pagination'; end if;
  if (public.get_admin_orders_page_v2('28000000-0000-0000-0000-000000000099')->>'total')::integer <> 0 then raise exception 'Order page crossed tenant'; end if;
  update public.orders set status='Preparing' where id='48000000-0000-0000-0000-000000000001';
  if (select status_started_at from public.orders where id='48000000-0000-0000-0000-000000000001') <= clock_before then raise exception 'Stage did not restart'; end if;
  update public.orders set status='Completed',payment_method='Cash on Delivery' where id='48000000-0000-0000-0000-000000000001';
  select closed_at into stopped_at from public.orders where id='48000000-0000-0000-0000-000000000001';
  if stopped_at is null then raise exception 'Completion did not stop timer'; end if;
  update public.orders set notes='Later edit' where id='48000000-0000-0000-0000-000000000001';
  if (select closed_at from public.orders where id='48000000-0000-0000-0000-000000000001') <> stopped_at then raise exception 'Completed timer changed'; end if;
  if has_function_privilege('authenticated','public.get_admin_orders_page_v2(uuid,text,text,integer,integer,text)','execute') then raise exception 'Browser can call service RPC'; end if;
end $$;
rollback;
