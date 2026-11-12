-- WhatsApp chat ordering v1.1: the two replies written by the order command
-- (order received / quote no longer available) follow the conversation's
-- language. The app stores 'en' or 'ar' in whatsapp_order_drafts.state.lang;
-- anything else, including drafts from before v1.1, gets English.
-- Same signature, checks and guarantees as 20261113090000; only those two
-- messages change.
begin;
set local lock_timeout = '5s';

create or replace function public.apply_whatsapp_order_command(
  target_restaurant_id uuid, target_conversation_id uuid, target_message_id text,
  expected_revision integer, next_state jsonb, response_text text,
  confirm_order boolean default false, handoff boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  conversation public.whatsapp_conversations%rowtype;
  draft public.whatsapp_order_drafts%rowtype;
  receipt public.whatsapp_order_receipts%rowtype;
  result_state jsonb := next_state;
  order_id uuid;
  amount numeric;
  needs_refresh boolean := false;
  customer_notes text;
  arabic boolean;
begin
  select * into conversation from public.whatsapp_conversations
    where restaurant_id=target_restaurant_id and id=target_conversation_id for update;
  if not found then raise exception 'Unknown conversation'; end if;
  select * into receipt from public.whatsapp_order_receipts
    where restaurant_id=target_restaurant_id and message_id=target_message_id
      and conversation_id=target_conversation_id;
  if found then return jsonb_build_object('reply',receipt.reply,'sent',receipt.sent); end if;
  if conversation.automation_state='paused' and
    (conversation.automation_paused_until is null or conversation.automation_paused_until > now()) then
    return jsonb_build_object('paused',true);
  end if;
  if not exists(select 1 from public.whatsapp_chatbot_settings s
    where s.restaurant_id=target_restaurant_id and s.enabled and s.answer_text
      and (s.chat_ordering_mode='everyone'
        or (s.chat_ordering_mode='approved' and conversation.customer_phone=any(s.chat_ordering_phones)))) then
    return jsonb_build_object('paused',true);
  end if;
  if target_message_id is null or length(target_message_id)>200 or length(response_text)>12000 then
    raise exception 'Invalid chat command';
  end if;
  insert into public.whatsapp_order_drafts(restaurant_id,conversation_id)
    values(target_restaurant_id,target_conversation_id) on conflict do nothing;
  select * into draft from public.whatsapp_order_drafts
    where restaurant_id=target_restaurant_id and conversation_id=target_conversation_id for update;
  if draft.revision <> expected_revision then return jsonb_build_object('conflict',true); end if;
  -- Replies written here follow the conversation's language (set by the app in state.lang).
  arabic := coalesce(draft.state->>'lang', '') = 'ar';
  if confirm_order then
    if draft.state->>'orderId' is not null or draft.state->>'token' is null
      or draft.state->>'token'='' or (draft.state->>'quotedAt')::timestamptz < now()-interval '10 minutes'
      or (draft.state->>'quotedAt')::timestamptz > now()
      or draft.state->>'quotedAt' is null or next_state <> draft.state then
      raise exception 'Expired or changed quote';
    end if;
    if not exists(select 1 from public.restaurants where id=target_restaurant_id and pickup_enabled
      and is_active and accepting_orders and status in ('live','trial','paid')
      and public.is_restaurant_open_at(opening_hours_enabled,opening_hours,time_zone)) then
      needs_refresh := true;
    end if;
    if jsonb_typeof(draft.state->'cart') <> 'array'
      or jsonb_array_length(draft.state->'cart') not between 1 and 20
      or nullif(trim(draft.state->>'name'),'') is null then raise exception 'Incomplete cart'; end if;
    -- Recheck live prices, options and availability inside the creation transaction.
    if exists(select 1 from jsonb_array_elements(draft.state->'cart') line
      where not public.whatsapp_chat_line_is_current(target_restaurant_id, line)) then
      needs_refresh := true;
    else
      -- Lines are validated, so the numeric casts below cannot fail.
      select round(sum((line->>'price')::numeric*(line->>'quantity')::integer), 2) into amount
        from jsonb_array_elements(draft.state->'cart') line;
      if amount < (select minimum_order_amount from public.restaurants where id=target_restaurant_id) then
        needs_refresh := true;
      end if;
      if (select sum((line->>'quantity')::integer) from jsonb_array_elements(draft.state->'cart') line) > 100 then
        raise exception 'Order quantity exceeds limit';
      end if;
    end if;
    if (select count(*) from public.orders where restaurant_id=target_restaurant_id
      and customer_phone=conversation.customer_phone and created_at > now()-interval '10 minutes') >= 10 then
      needs_refresh := true;
    end if;
    if needs_refresh then
      result_state := draft.state || '{"token":"","quotedAt":null}'::jsonb;
      response_text := case when arabic
        then 'لم يعد هذا الإجمالي متاحاً أو تم إرسال طلبات كثيرة. لم يتم تسجيل أي طلب. أرسل «السلة» للحصول على إجمالي محدّث بالأسعار والتوفر الحالي، أو «موظف» للمساعدة.'
        else 'The quote is no longer available or too many orders were submitted. No order was placed. Send CART for a fresh total with current availability and prices, or STAFF for help.' end;
    else
      customer_notes := nullif(left(trim(coalesce(draft.state->>'notes','')),500),'');
      order_id := public.create_order_with_customer_v4(
        target_restaurant_id, left(trim(draft.state->>'name'),120), conversation.customer_phone, 'takeaway',
        null,null,null,null,null,null,null,null,null,null,null,
        'WhatsApp chat order — payment due at collection'
          || coalesce(E'\nCustomer notes: '||customer_notes, ''),
        'Cash on Delivery',
        draft.state->'cart', amount, 0, amount, response_text, true, false, now(),
        'wa-cart:'||target_conversation_id::text||':'||(draft.state->>'token')
      );
      -- Pending customer ticket: never mark paid merely because chat was confirmed.
      update public.orders set payment_method=null, source='whatsapp_chat'
        where id=order_id and restaurant_id=target_restaurant_id;
      result_state := jsonb_set(draft.state,'{orderId}',to_jsonb(order_id::text));
      response_text := case when arabic
        then 'تم استلام طلب السفري '||order_id::text||'. الدفع عند الاستلام. سيؤكد المطعم التحضير. أرسل «موظف» لأي تعديل، أو «طلب جديد» لبدء طلب آخر.'
        else 'Order '||order_id::text||' received for takeaway. Payment is due at collection. The restaurant will confirm preparation. Send STAFF for changes, or NEW ORDER to start another order.' end;
    end if;
  end if;
  update public.whatsapp_order_drafts set state=result_state,revision=revision+1,updated_at=now()
    where restaurant_id=target_restaurant_id and conversation_id=target_conversation_id;
  if handoff then
    update public.whatsapp_conversations set automation_state='paused',automation_paused_until=null,
      handoff_requested_at=now(),handoff_reason='Customer requested staff during takeaway ordering'
      where restaurant_id=target_restaurant_id and id=target_conversation_id;
  end if;
  insert into public.whatsapp_order_receipts(restaurant_id,message_id,conversation_id,reply)
    values(target_restaurant_id,target_message_id,target_conversation_id,response_text);
  return jsonb_build_object('reply',response_text,'sent',false);
end;
$$;
revoke all on function public.apply_whatsapp_order_command(uuid,uuid,text,integer,jsonb,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.apply_whatsapp_order_command(uuid,uuid,text,integer,jsonb,text,boolean,boolean) to service_role;

do $verify_whatsapp_chat_order_language$
begin
  if has_function_privilege('anon', 'public.apply_whatsapp_order_command(uuid,uuid,text,integer,jsonb,text,boolean,boolean)', 'execute')
    or has_function_privilege('authenticated', 'public.apply_whatsapp_order_command(uuid,uuid,text,integer,jsonb,text,boolean,boolean)', 'execute') then
    raise exception 'apply_whatsapp_order_command must stay service-role only';
  end if;
end;
$verify_whatsapp_chat_order_language$;

notify pgrst, 'reload schema';
commit;
