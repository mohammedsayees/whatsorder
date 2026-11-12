begin;
insert into public.restaurants(id,name,slug,whatsapp_number,status,is_active,accepting_orders,pickup_enabled,minimum_order_amount)
values('29400000-0000-0000-0000-000000000001','Chat lang','chat-lang','971500000093','live',true,true,true,0);
insert into public.menu_categories(id,restaurant_id,name) values
('39400000-0000-0000-0000-000000000001','29400000-0000-0000-0000-000000000001','Tea');
insert into public.menu_items(id,restaurant_id,category_id,name,name_ar,price,is_available) values
('49400000-0000-0000-0000-000000000001','29400000-0000-0000-0000-000000000001','39400000-0000-0000-0000-000000000001','Karak','كرك',2,true);
insert into public.whatsapp_conversations(id,restaurant_id,customer_phone,customer_name) values
('59400000-0000-0000-0000-000000000001','29400000-0000-0000-0000-000000000001','971500000021','Sara'),
('59400000-0000-0000-0000-000000000002','29400000-0000-0000-0000-000000000001','971500000022','Ali');
insert into public.whatsapp_chatbot_settings(restaurant_id,enabled,answer_text,chat_ordering_mode)
values('29400000-0000-0000-0000-000000000001',true,true,'everyone');

do $$ declare
  r uuid := '29400000-0000-0000-0000-000000000001';
  arabic_chat uuid := '59400000-0000-0000-0000-000000000001';
  english_chat uuid := '59400000-0000-0000-0000-000000000002';
  line jsonb := jsonb_build_object('item_id','49400000-0000-0000-0000-000000000001','name','Karak','name_ar','كرك','price',2,'quantity',1);
  draft jsonb; result jsonb;
begin
  -- Arabic conversation: the order-received reply is Arabic and the order is created once.
  draft := jsonb_build_object('cart',jsonb_build_array(line),'name','Sara','token','ar1','quotedAt',now(),'orderId',null,'lang','ar');
  perform public.apply_whatsapp_order_command(r,arabic_chat,'ar-q',0,draft,'quote');
  result := public.apply_whatsapp_order_command(r,arabic_chat,'ar-y',1,draft,'confirm',true);
  if result->>'reply' not like 'تم استلام طلب السفري %' then raise exception 'Arabic receipt missing: %', result; end if;
  if (select count(*) from public.orders where restaurant_id=r) <> 1 then raise exception 'Arabic confirm did not create one order'; end if;

  -- Arabic refresh reply when the price changed after the quote.
  draft := jsonb_build_object('cart',jsonb_build_array(line),'name','Sara','token','ar2','quotedAt',now(),'orderId',null,'lang','ar');
  perform public.apply_whatsapp_order_command(r,arabic_chat,'ar-q2',2,draft,'quote');
  update public.menu_items set price=3 where restaurant_id=r;
  result := public.apply_whatsapp_order_command(r,arabic_chat,'ar-y2',3,draft,'confirm',true);
  if result->>'reply' not like 'لم يعد هذا الإجمالي متاحاً%' then raise exception 'Arabic refresh missing: %', result; end if;
  update public.menu_items set price=2 where restaurant_id=r;

  -- No lang (pre-v1.1 draft) and 'en' both get English.
  draft := jsonb_build_object('cart',jsonb_build_array(line),'name','Ali','token','en1','quotedAt',now(),'orderId',null);
  perform public.apply_whatsapp_order_command(r,english_chat,'en-q',0,draft,'quote');
  result := public.apply_whatsapp_order_command(r,english_chat,'en-y',1,draft,'confirm',true);
  if result->>'reply' not like 'Order % received for takeaway%' then raise exception 'English receipt missing: %', result; end if;
  if (select count(*) from public.orders where restaurant_id=r and source='whatsapp_chat') <> 2 then
    raise exception 'Chat orders not created with source'; end if;
end $$;
rollback;
