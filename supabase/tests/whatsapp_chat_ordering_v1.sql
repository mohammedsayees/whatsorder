begin;
insert into public.restaurants(id,name,slug,whatsapp_number,status,is_active,accepting_orders,pickup_enabled,minimum_order_amount)
values('29200000-0000-0000-0000-000000000001','Chat v1','chat-v1','971500000088','live',true,true,true,0),
      ('29200000-0000-0000-0000-000000000002','Other tenant','chat-v1-other','971500000089','live',true,true,true,0);
insert into public.menu_categories(id,restaurant_id,name) values
('39200000-0000-0000-0000-000000000001','29200000-0000-0000-0000-000000000001','Tea');
insert into public.menu_items(id,restaurant_id,category_id,name,price,is_available) values
('49200000-0000-0000-0000-000000000001','29200000-0000-0000-0000-000000000001','39200000-0000-0000-0000-000000000001','Karak',2,true),
('49200000-0000-0000-0000-000000000002','29200000-0000-0000-0000-000000000001','39200000-0000-0000-0000-000000000001','Burger',10,true);
-- Karak: required Size (exactly one), optional Extras (up to two).
insert into public.menu_option_groups(id,restaurant_id,name,min_select,max_select) values
('69200000-0000-0000-0000-000000000001','29200000-0000-0000-0000-000000000001','Size',1,1),
('69200000-0000-0000-0000-000000000002','29200000-0000-0000-0000-000000000001','Extras',0,2),
('69200000-0000-0000-0000-000000000003','29200000-0000-0000-0000-000000000001','Burger sauce',0,1);
insert into public.menu_options(id,restaurant_id,group_id,name,price_delta,is_available) values
('79200000-0000-0000-0000-000000000001','29200000-0000-0000-0000-000000000001','69200000-0000-0000-0000-000000000001','Small',0,true),
('79200000-0000-0000-0000-000000000002','29200000-0000-0000-0000-000000000001','69200000-0000-0000-0000-000000000001','Large',1.5,true),
('79200000-0000-0000-0000-000000000003','29200000-0000-0000-0000-000000000001','69200000-0000-0000-0000-000000000002','Saffron',0.5,true),
('79200000-0000-0000-0000-000000000004','29200000-0000-0000-0000-000000000001','69200000-0000-0000-0000-000000000003','Garlic',1,true);
insert into public.menu_item_option_groups(restaurant_id,menu_item_id,group_id) values
('29200000-0000-0000-0000-000000000001','49200000-0000-0000-0000-000000000001','69200000-0000-0000-0000-000000000001'),
('29200000-0000-0000-0000-000000000001','49200000-0000-0000-0000-000000000001','69200000-0000-0000-0000-000000000002'),
('29200000-0000-0000-0000-000000000001','49200000-0000-0000-0000-000000000002','69200000-0000-0000-0000-000000000003');
insert into public.whatsapp_conversations(id,restaurant_id,customer_phone,customer_name) values
('59200000-0000-0000-0000-000000000001','29200000-0000-0000-0000-000000000001','971500000011','Profile Name'),
('59200000-0000-0000-0000-000000000002','29200000-0000-0000-0000-000000000002','971500000012',null);
insert into public.whatsapp_chatbot_settings(restaurant_id,enabled,answer_text,chat_ordering_mode,chat_ordering_phones)
values('29200000-0000-0000-0000-000000000001',true,true,'off',array['971500000099']);

do $$ declare
  r uuid := '29200000-0000-0000-0000-000000000001';
  c uuid := '59200000-0000-0000-0000-000000000001';
  karak text := '49200000-0000-0000-0000-000000000001';
  size_g text := '69200000-0000-0000-0000-000000000001';
  extras_g text := '69200000-0000-0000-0000-000000000002';
  sauce_g text := '69200000-0000-0000-0000-000000000003';
  small text := '79200000-0000-0000-0000-000000000001';
  large text := '79200000-0000-0000-0000-000000000002';
  saffron text := '79200000-0000-0000-0000-000000000003';
  garlic text := '79200000-0000-0000-0000-000000000004';
  draft jsonb; result jsonb; saved public.orders%rowtype; rev integer := 0;
  opt jsonb;
begin
  -- Rollout mode: off and approved-without-this-phone both decline.
  draft := jsonb_build_object('cart','[]'::jsonb,'name','Profile Name','token','','quotedAt',null,'orderId',null);
  result := public.apply_whatsapp_order_command(r,c,'m-off',0,draft,'x');
  if result->>'paused' <> 'true' then raise exception 'Mode off accepted command'; end if;
  update public.whatsapp_chatbot_settings set chat_ordering_mode='approved' where restaurant_id=r;
  if not (select chat_ordering_enabled from public.whatsapp_chatbot_settings where restaurant_id=r) then
    raise exception 'Mode did not drive pilot boolean'; end if;
  result := public.apply_whatsapp_order_command(r,c,'m-approved',0,draft,'x');
  if result->>'paused' <> 'true' then raise exception 'Unapproved phone accepted'; end if;
  -- A previous app build that only writes the boolean still turns ordering off.
  update public.whatsapp_chatbot_settings set chat_ordering_enabled=false where restaurant_id=r;
  if (select chat_ordering_mode from public.whatsapp_chatbot_settings where restaurant_id=r) <> 'off' then
    raise exception 'Pilot boolean did not drive mode'; end if;
  update public.whatsapp_chatbot_settings set chat_ordering_mode='everyone' where restaurant_id=r;
  result := public.apply_whatsapp_order_command(r,c,'m-everyone',0,draft,'ok');
  if result->>'reply' <> 'ok' then raise exception 'Everyone mode declined unlisted phone'; end if;
  rev := 1;

  -- Option re-check: each bad line is refused at confirmation (no order, quote cleared).
  foreach opt in array array[
    -- missing required Size
    jsonb_build_object('item_id',karak,'name','Karak','price',2,'quantity',1),
    -- wrong price for Large (base 2 + 1.5)
    jsonb_build_object('item_id',karak,'name','Karak','price',2,'quantity',1,'options',
      jsonb_build_array(jsonb_build_object('option_id',large,'group_id',size_g,'name','Large','price_delta',0))),
    -- two sizes exceed max_select
    jsonb_build_object('item_id',karak,'name','Karak','price',3.5,'quantity',1,'options',
      jsonb_build_array(jsonb_build_object('option_id',small,'group_id',size_g),jsonb_build_object('option_id',large,'group_id',size_g))),
    -- duplicate option
    jsonb_build_object('item_id',karak,'name','Karak','price',3,'quantity',1,'options',
      jsonb_build_array(jsonb_build_object('option_id',small,'group_id',size_g),jsonb_build_object('option_id',saffron,'group_id',extras_g),
        jsonb_build_object('option_id',saffron,'group_id',extras_g))),
    -- option belongs to another item's group
    jsonb_build_object('item_id',karak,'name','Karak','price',3,'quantity',1,'options',
      jsonb_build_array(jsonb_build_object('option_id',small,'group_id',size_g),jsonb_build_object('option_id',garlic,'group_id',sauce_g))),
    -- option's claimed group is wrong
    jsonb_build_object('item_id',karak,'name','Karak','price',2.5,'quantity',1,'options',
      jsonb_build_array(jsonb_build_object('option_id',saffron,'group_id',size_g))),
    -- malformed ids and fractional quantity
    jsonb_build_object('item_id','not-a-uuid','name','Karak','price',2,'quantity',1),
    jsonb_build_object('item_id',karak,'name','Karak','price',2,'quantity',1.5,'options',
      jsonb_build_array(jsonb_build_object('option_id',small,'group_id',size_g))),
    -- offers are not part of chat ordering
    jsonb_build_object('item_id',karak,'offer_id',gen_random_uuid(),'name','Karak','price',2,'quantity',1,'options',
      jsonb_build_array(jsonb_build_object('option_id',small,'group_id',size_g)))
  ] loop
    draft := jsonb_build_object('cart',jsonb_build_array(opt),'name','Profile Name',
      'token','t'||rev,'quotedAt',now(),'orderId',null);
    perform public.apply_whatsapp_order_command(r,c,'q'||rev,rev,draft,'quote'); rev := rev+1;
    result := public.apply_whatsapp_order_command(r,c,'y'||rev,rev,draft,'confirm',true); rev := rev+1;
    if exists(select 1 from public.orders where restaurant_id=r) then
      raise exception 'Invalid option line created an order: %', opt; end if;
    if result->>'reply' not like 'The quote is no longer available%' then
      raise exception 'Invalid option line not refreshed: %', result; end if;
  end loop;

  -- A valid configured line (Large + Saffron = 2 + 1.5 + 0.5) with notes creates one chat order.
  opt := jsonb_build_object('item_id',karak,'name','Karak','price',4,'quantity',2,'options',jsonb_build_array(
    jsonb_build_object('option_id',large,'group_id',size_g,'name','Large','price_delta',1.5),
    jsonb_build_object('option_id',saffron,'group_id',extras_g,'name','Saffron','price_delta',0.5)));
  draft := jsonb_build_object('cart',jsonb_build_array(opt),'name','Profile Name','notes','less sugar',
    'token','valid','quotedAt',now(),'orderId',null);
  perform public.apply_whatsapp_order_command(r,c,'q-valid',rev,draft,'quote'); rev := rev+1;
  result := public.apply_whatsapp_order_command(r,c,'y-valid',rev,draft,'confirm',true);
  select * into saved from public.orders where restaurant_id=r;
  if saved.id is null or saved.source <> 'whatsapp_chat' or saved.total <> 8 or saved.payment_method is not null
    or saved.fulfilment_type <> 'takeaway' or saved.customer_name <> 'Profile Name'
    or saved.notes not like '%Customer notes: less sugar%' or saved.status <> 'New' then
    raise exception 'Configured chat order wrong: %', row_to_json(saved);
  end if;
  -- Retried and repeated confirmations never create a second order.
  result := public.apply_whatsapp_order_command(r,c,'y-valid',rev,draft,'confirm',true);
  if result->>'reply' not like 'Order % received%' then raise exception 'Retry lost acknowledgement'; end if;
  rev := rev+1;
  draft := jsonb_set(draft,'{orderId}',to_jsonb(saved.id::text));
  begin
    perform public.apply_whatsapp_order_command(r,c,'y-again',rev,draft,'confirm',true);
    raise exception 'Repeated YES accepted';
  exception when others then
    if sqlerrm <> 'Expired or changed quote' then raise; end if;
  end;
  if (select count(*) from public.orders where restaurant_id=r) <> 1 then raise exception 'Duplicate order'; end if;

  -- Parse log: tenant-consistent, service-role only, 90-day retention.
  insert into public.whatsapp_order_parse_logs(restaurant_id,conversation_id,message_id,parser,input_text,outcome,created_at)
    values(r,c,'old','gemini','2 karak','accepted',now()-interval '91 days');
  insert into public.whatsapp_order_parse_logs(restaurant_id,conversation_id,message_id,parser,input_text,outcome)
    values(r,c,'new','deterministic','2 karak','accepted');
  if exists(select 1 from public.whatsapp_order_parse_logs where message_id='old') then
    raise exception 'Expired parse log retained'; end if;
  begin
    insert into public.whatsapp_order_parse_logs(restaurant_id,conversation_id,message_id,parser,input_text,outcome)
      values('29200000-0000-0000-0000-000000000002',c,'cross','gemini','x','accepted');
    raise exception 'Cross-tenant parse log accepted';
  exception when foreign_key_violation then null;
  end;
  if has_table_privilege('anon','public.whatsapp_order_parse_logs','select')
    or has_table_privilege('authenticated','public.whatsapp_order_parse_logs','insert')
    or has_table_privilege('authenticated','public.whatsapp_order_parse_logs','update') then
    raise exception 'Browser can write parse logs'; end if;
end $$;
rollback;
