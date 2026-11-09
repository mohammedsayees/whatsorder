begin;
insert into public.restaurants(id,name,slug,whatsapp_number,status,is_active,accepting_orders,pickup_enabled,minimum_order_amount)
values('29100000-0000-0000-0000-000000000001','Chat pilot','chat-pilot','971500000078','live',true,true,true,0);
insert into public.menu_categories(id,restaurant_id,name) values
('39100000-0000-0000-0000-000000000001','29100000-0000-0000-0000-000000000001','Tea');
insert into public.menu_items(id,restaurant_id,category_id,name,price,is_available) values
('49100000-0000-0000-0000-000000000001','29100000-0000-0000-0000-000000000001','39100000-0000-0000-0000-000000000001','Karak',2,true);
insert into public.whatsapp_conversations(id,restaurant_id,customer_phone) values
('59100000-0000-0000-0000-000000000001','29100000-0000-0000-0000-000000000001','971500000077');
insert into public.whatsapp_chatbot_settings(restaurant_id,enabled,answer_text,chat_ordering_enabled,chat_ordering_phones)
values('29100000-0000-0000-0000-000000000001',true,true,true,array['971500000077']);

do $$ declare
  r uuid := '29100000-0000-0000-0000-000000000001';
  c uuid := '59100000-0000-0000-0000-000000000001';
  draft jsonb; result jsonb; saved public.orders%rowtype;
begin
  draft := jsonb_build_object('cart',jsonb_build_array(jsonb_build_object(
    'item_id','49100000-0000-0000-0000-000000000001','name','Karak','price',2,'quantity',2)),
    'name','Test customer','token','aabbcc','quotedAt',now(),'orderId',null);
  result := public.apply_whatsapp_order_command(r,c,'quote',0,draft,'Review quote');
  if result->>'reply' <> 'Review quote' then raise exception 'Quote not saved'; end if;
  result := public.apply_whatsapp_order_command(r,c,'old-edit',0,draft,'stale');
  if result->>'conflict' <> 'true' then raise exception 'Stale edit accepted'; end if;
  result := public.apply_whatsapp_order_command(r,c,'confirm',1,draft,'Takeaway quote',true);
  select * into saved from public.orders where restaurant_id=r;
  if saved.id is null or saved.status <> 'New' or saved.total <> 4 or saved.payment_method is not null
    or not saved.consent_order_processing or saved.consent_marketing or saved.fulfilment_type <> 'takeaway' then
    raise exception 'Chat confirmation did not create one unpaid consented takeaway order';
  end if;
  result := public.apply_whatsapp_order_command(r,c,'confirm',1,draft,'Takeaway quote',true);
  if (select count(*) from public.orders where restaurant_id=r) <> 1 then raise exception 'Retry duplicated order'; end if;
  if result->>'reply' not like 'Order % received%' then raise exception 'Retry lost acknowledgement'; end if;

  -- A new quote must not commit at a stale menu price.
  draft := jsonb_set(draft,'{token}','"new-token"');
  perform public.apply_whatsapp_order_command(r,c,'new-quote',2,draft,'Review quote');
  update public.menu_items set price=3 where restaurant_id=r;
  result := public.apply_whatsapp_order_command(r,c,'price-race',3,draft,'Review quote',true);
  if (select count(*) from public.orders where restaurant_id=r) <> 1 then raise exception 'Stale price accepted'; end if;
  if (select state->>'token' from public.whatsapp_order_drafts where restaurant_id=r) <> '' then
    raise exception 'Stale quote remains confirmable'; end if;
  -- Handoff is durable even before WhatsApp delivers its reply.
  perform public.apply_whatsapp_order_command(r,c,'handoff',4,draft,'Staff will help',false,true);
  result := public.apply_whatsapp_order_command(r,c,'blocked',5,draft,'Must not run',true);
  if result->>'paused' <> 'true' then raise exception 'Staff takeover ignored'; end if;
  update public.whatsapp_conversations set automation_state='active' where id=c and restaurant_id=r;
  draft := jsonb_set(draft,'{quotedAt}',to_jsonb(now()-interval '15 minutes'));
  perform public.apply_whatsapp_order_command(r,c,'expired-quote',5,draft,'Review quote');
  begin
    perform public.apply_whatsapp_order_command(r,c,'expired-confirm',6,draft,'Must not run',true);
    raise exception 'Expired confirmation accepted';
  exception when others then
    if sqlerrm <> 'Expired or changed quote' then raise; end if;
  end;
  update public.whatsapp_chatbot_settings set chat_ordering_enabled=false where restaurant_id=r;
  result := public.apply_whatsapp_order_command(r,c,'disabled',6,draft,'Must not run');
  if result->>'paused' <> 'true' then raise exception 'Disabled pilot accepted command'; end if;
  begin
    perform public.apply_whatsapp_order_command('29100000-0000-0000-0000-000000000099',c,'wrong-tenant',6,draft,'Must not run');
    raise exception 'Cross tenant command accepted';
  exception when others then
    if sqlerrm <> 'Unknown conversation' then raise; end if;
  end;
  if has_function_privilege('authenticated','public.apply_whatsapp_order_command(uuid,uuid,text,integer,jsonb,text,boolean,boolean)','execute')
    or has_table_privilege('anon','public.whatsapp_order_drafts','select') then raise exception 'Browser has access'; end if;
end $$;
rollback;
