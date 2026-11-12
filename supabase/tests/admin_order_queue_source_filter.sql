begin;
insert into public.restaurants(id,name,slug,whatsapp_number,status,is_active,accepting_orders,pickup_enabled,minimum_order_amount)
values('29300000-0000-0000-0000-000000000001','Source queue','source-queue','971500000091','live',true,true,true,0),
      ('29300000-0000-0000-0000-000000000002','Other source queue','source-queue-other','971500000092','live',true,true,true,0);
insert into public.orders (id, restaurant_id, customer_name, customer_phone, fulfilment_type, payment_method,
  items, subtotal, delivery_fee, total, status, whatsapp_message, consent_order_processing, consent_timestamp, source)
values
  ('49300000-0000-0000-0000-000000000001','29300000-0000-0000-0000-000000000001','Chat one','971500000001','takeaway',null,'[]',5,0,5,'New','x',true,now(),'whatsapp_chat'),
  ('49300000-0000-0000-0000-000000000002','29300000-0000-0000-0000-000000000001','Chat two','971500000002','takeaway',null,'[]',5,0,5,'Completed','x',true,now(),'whatsapp_chat'),
  ('49300000-0000-0000-0000-000000000003','29300000-0000-0000-0000-000000000001','Link','971500000003','delivery',null,'[]',5,0,5,'New','x',true,now(),'customer'),
  ('49300000-0000-0000-0000-000000000004','29300000-0000-0000-0000-000000000001','Counter','971500000004','takeaway',null,'[]',5,0,5,'New','x',true,now(),'staff'),
  ('49300000-0000-0000-0000-000000000005','29300000-0000-0000-0000-000000000002','Other chat','971500000005','takeaway',null,'[]',5,0,5,'New','x',true,now(),'whatsapp_chat');

do $$ declare
  r uuid := '29300000-0000-0000-0000-000000000001';
  result jsonb;
begin
  result := public.get_admin_orders_page_v4(r, 'active', 'all', 1, 25, 'oldest', null, 'whatsapp_chat');
  if (result->>'total')::int <> 1 or result->'items'->0->>'customer_name' <> 'Chat one' then
    raise exception 'WhatsApp chat filter wrong: %', result; end if;
  -- Status counts follow the source filter, like search.
  if (result->'status_counts'->>'active')::int <> 1 or (result->'status_counts'->>'completed')::int <> 1 then
    raise exception 'Source-filtered counts wrong: %', result->'status_counts'; end if;

  result := public.get_admin_orders_page_v4(r, 'active', 'all', 1, 25, 'oldest', null, 'all');
  if (result->>'total')::int <> 3 then raise exception 'All sources should list 3 active orders: %', result->>'total'; end if;
  -- v4 with 'all' matches v3 exactly.
  if result <> public.get_admin_orders_page_v3(r, 'active', 'all', 1, 25, 'oldest', null) then
    raise exception 'v4 (all sources) differs from v3'; end if;

  result := public.get_admin_orders_page_v4(r, 'active', 'all', 1, 25, 'oldest', null, 'staff');
  if (result->>'total')::int <> 1 or result->'items'->0->>'customer_name' <> 'Counter' then
    raise exception 'Staff filter wrong'; end if;
  result := public.get_admin_orders_page_v4(r, 'active', 'takeaway', 1, 25, 'oldest', 'chat', 'whatsapp_chat');
  if (result->>'total')::int <> 1 then raise exception 'Source + fulfilment + search should combine'; end if;

  begin
    perform public.get_admin_orders_page_v4(r, 'active', 'all', 1, 25, 'oldest', null, 'fax');
    raise exception 'Invalid source accepted';
  exception when sqlstate '22023' then null;
  end;

  if has_function_privilege('authenticated','public.get_admin_orders_page_v4(uuid,text,text,integer,integer,text,text,text)','execute')
    or has_function_privilege('anon','public.get_admin_orders_page_v4(uuid,text,text,integer,integer,text,text,text)','execute') then
    raise exception 'Browser can call the queue RPC'; end if;
end $$;
rollback;
