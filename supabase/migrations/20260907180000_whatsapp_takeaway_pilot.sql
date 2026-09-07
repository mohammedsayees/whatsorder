begin;
set local lock_timeout = '5s';

alter table public.whatsapp_chatbot_settings
  add column chat_ordering_enabled boolean not null default false,
  add column chat_ordering_phones text[] not null default '{}';

create table public.whatsapp_order_drafts (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  conversation_id uuid not null,
  revision integer not null default 0,
  state jsonb not null default '{"cart":[],"name":"","token":"","quotedAt":null,"orderId":null}',
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, conversation_id),
  foreign key (conversation_id,restaurant_id) references public.whatsapp_conversations(id,restaurant_id) on delete cascade
);
create table public.whatsapp_order_receipts (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  message_id text not null,
  conversation_id uuid not null,
  reply text not null,
  sent boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (restaurant_id, message_id),
  foreign key (conversation_id,restaurant_id) references public.whatsapp_conversations(id,restaurant_id) on delete cascade
);
alter table public.whatsapp_order_drafts enable row level security;
alter table public.whatsapp_order_receipts enable row level security;
revoke all on public.whatsapp_order_drafts, public.whatsapp_order_receipts from public, anon, authenticated;
grant all on public.whatsapp_order_drafts, public.whatsapp_order_receipts to service_role;

-- All state edits and order creation are serialized with staff takeover and
-- version checked. The reply receipt commits in the same transaction as the order.
create function public.apply_whatsapp_order_command(
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
    where s.restaurant_id=target_restaurant_id and s.enabled and s.answer_text and s.chat_ordering_enabled
      and conversation.customer_phone=any(s.chat_ordering_phones)) then
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
    if jsonb_array_length(draft.state->'cart') not between 1 and 20
      or nullif(trim(draft.state->>'name'),'') is null then raise exception 'Incomplete cart'; end if;
    -- Recheck live base prices and availability inside the creation transaction.
    -- Configurable products and offers are deliberately outside this initial pilot.
    if exists(select 1 from jsonb_array_elements(draft.state->'cart') line
      where not exists(select 1 from public.menu_items i
        join public.menu_categories c on c.id=i.category_id and c.restaurant_id=i.restaurant_id
        where i.id=(line->>'item_id')::uuid and i.restaurant_id=target_restaurant_id
          and i.is_available and not i.staff_only and c.is_active
          and i.price=(line->>'price')::numeric)
        or (line->>'quantity')::integer not between 1 and 25
        or line->>'offer_id' is not null
        or exists(select 1 from public.menu_item_option_groups l
          where l.restaurant_id=target_restaurant_id and l.menu_item_id=(line->>'item_id')::uuid)) then
      needs_refresh := true;
    end if;
    select sum((line->>'price')::numeric*(line->>'quantity')::integer) into amount
      from jsonb_array_elements(draft.state->'cart') line;
    if amount < (select minimum_order_amount from public.restaurants where id=target_restaurant_id) then
      needs_refresh := true;
    end if;
    if (select sum((line->>'quantity')::integer) from jsonb_array_elements(draft.state->'cart') line) > 100 then
      raise exception 'Order quantity exceeds limit';
    end if;
    if (select count(*) from public.orders where restaurant_id=target_restaurant_id
      and customer_phone=conversation.customer_phone and created_at > now()-interval '10 minutes') >= 10 then
      needs_refresh := true;
    end if;
    if needs_refresh then
      result_state := draft.state || '{"token":"","quotedAt":null}'::jsonb;
      response_text := 'The quote is no longer available or too many orders were submitted. No order was placed. Send CHECKOUT to review current availability and prices, or STAFF for help.';
    else
    order_id := public.create_order_with_customer_v4(
      target_restaurant_id, draft.state->>'name', conversation.customer_phone, 'takeaway',
      null,null,null,null,null,null,null,null,null,null,null,
      'WhatsApp takeaway pilot — payment due at collection', 'Cash on Delivery',
      draft.state->'cart', amount, 0, amount, response_text, true, false, now(),
      'wa-cart:'||target_conversation_id::text||':'||(draft.state->>'token')
    );
    update public.orders set payment_method=null where id=order_id and restaurant_id=target_restaurant_id;
    -- Pending customer ticket: never mark paid merely because chat was confirmed.
    result_state := jsonb_set(draft.state,'{orderId}',to_jsonb(order_id::text));
    response_text := 'Order '||order_id::text||' received for takeaway. Payment is due at collection. The restaurant will confirm preparation. Send STAFF for changes, or NEW ORDER to start another cart.';
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
notify pgrst, 'reload schema';
commit;
