-- WhatsApp chat-to-order v1.
--
-- 1. Rollout setting: chat ordering off / approved phones / everyone. The
--    pilot boolean is kept and synchronised both ways, so rolling the app back
--    to the pilot build keeps working (its switch still turns ordering off).
-- 2. orders.source accepts 'whatsapp_chat' for chat-confirmed tickets.
-- 3. whatsapp_order_parse_logs: one row per parse for staff review. Service
--    role writes only; managers of the same restaurant may read. Rows older
--    than 90 days are purged on insert.
-- 4. apply_whatsapp_order_command now honours the rollout mode, re-checks
--    configured options (availability, links, min/max, price deltas) inside
--    the creation transaction, carries customer notes and marks the source.
begin;
set local lock_timeout = '5s';

-- 1. Rollout mode ---------------------------------------------------------
alter table public.whatsapp_chatbot_settings
  add column chat_ordering_mode text not null default 'off'
    constraint whatsapp_chatbot_settings_chat_ordering_mode_check
    check (chat_ordering_mode in ('off', 'approved', 'everyone'));
update public.whatsapp_chatbot_settings
  set chat_ordering_mode = 'approved' where chat_ordering_enabled;

-- A writer that only knows the pilot boolean (the previous app build) drives
-- the mode; otherwise the mode drives the boolean.
create function public.sync_whatsapp_chat_ordering_mode()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
    and new.chat_ordering_mode is not distinct from old.chat_ordering_mode
    and new.chat_ordering_enabled is distinct from old.chat_ordering_enabled then
    new.chat_ordering_mode := case when new.chat_ordering_enabled then 'approved' else 'off' end;
  elsif tg_op = 'INSERT' and new.chat_ordering_enabled and new.chat_ordering_mode = 'off' then
    new.chat_ordering_mode := 'approved';
  end if;
  new.chat_ordering_enabled := new.chat_ordering_mode <> 'off';
  return new;
end;
$$;
revoke all on function public.sync_whatsapp_chat_ordering_mode() from public, anon, authenticated;
create trigger whatsapp_chatbot_settings_sync_chat_ordering_mode
  before insert or update on public.whatsapp_chatbot_settings
  for each row execute function public.sync_whatsapp_chat_ordering_mode();

-- 2. Order source ---------------------------------------------------------
alter table public.orders drop constraint if exists orders_source_check;
alter table public.orders add constraint orders_source_check
  check (source in ('customer', 'staff', 'whatsapp_chat'));

-- 3. Parse review log -----------------------------------------------------
create table public.whatsapp_order_parse_logs (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  conversation_id uuid not null,
  message_id text not null check (length(message_id) <= 200),
  parser text not null check (parser in ('deterministic', 'gemini')),
  model text check (length(model) <= 100),
  input_text text not null check (length(input_text) <= 2000),
  parsed jsonb,
  outcome text not null check (outcome in ('accepted', 'clarify', 'rejected', 'error')),
  reason text check (length(reason) <= 500),
  created_at timestamptz not null default now(),
  unique (restaurant_id, message_id, parser),
  foreign key (conversation_id, restaurant_id)
    references public.whatsapp_conversations(id, restaurant_id) on delete cascade
);
create index whatsapp_order_parse_logs_review
  on public.whatsapp_order_parse_logs(restaurant_id, created_at desc);
create index whatsapp_order_parse_logs_conversation
  on public.whatsapp_order_parse_logs(restaurant_id, conversation_id, created_at desc);

alter table public.whatsapp_order_parse_logs enable row level security;
revoke all on public.whatsapp_order_parse_logs from public, anon, authenticated;
grant select on public.whatsapp_order_parse_logs to authenticated;
grant all on public.whatsapp_order_parse_logs to service_role;
create policy "Managers can read chat order parse logs"
  on public.whatsapp_order_parse_logs for select to authenticated
  using (
    public.is_restaurant_member(
      whatsapp_order_parse_logs.restaurant_id,
      array['restaurant_admin', 'owner', 'manager']
    )
    or public.is_super_admin()
  );

-- Customer message text is personal data: keep at most 90 days.
create function public.purge_old_whatsapp_order_parse_logs()
returns trigger language plpgsql set search_path = '' as $$
begin
  delete from public.whatsapp_order_parse_logs
    where restaurant_id = new.restaurant_id and created_at < now() - interval '90 days';
  return null;
end;
$$;
revoke all on function public.purge_old_whatsapp_order_parse_logs() from public, anon, authenticated;
create trigger whatsapp_order_parse_logs_retention
  after insert on public.whatsapp_order_parse_logs
  for each row execute function public.purge_old_whatsapp_order_parse_logs();

-- 4. Order command --------------------------------------------------------
-- True when one stored chat cart line still matches the live catalog exactly:
-- public, available item in an active category; no offer; every option
-- available, in its claimed group and linked to the item; no duplicates;
-- each linked group's selection within its effective min/max; and the unit
-- price equal to base price + option deltas (clamped at zero), the same rule
-- as verifyCartAgainstMenu.
create function public.whatsapp_chat_line_is_current(target_restaurant_id uuid, line jsonb)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
declare
  line_item uuid;
  base_price numeric;
  selected jsonb := coalesce(line->'options', '[]'::jsonb);
  delta_sum numeric;
begin
  if jsonb_typeof(selected) <> 'array' or line->>'offer_id' is not null
    or jsonb_typeof(line->'quantity') <> 'number'
    or (line->>'quantity')::numeric <> trunc((line->>'quantity')::numeric)
    or (line->>'quantity')::integer not between 1 and 25 then
    return false;
  end if;
  line_item := (line->>'item_id')::uuid;
  select i.price into base_price from public.menu_items i
    join public.menu_categories c on c.id = i.category_id and c.restaurant_id = i.restaurant_id
    where i.id = line_item and i.restaurant_id = target_restaurant_id
      and i.is_available and not i.staff_only and c.is_active;
  if not found then return false; end if;

  if (select count(*) <> count(distinct x->>'option_id') from jsonb_array_elements(selected) x) then
    return false;
  end if;
  if exists (select 1 from jsonb_array_elements(selected) x
    where not exists (select 1 from public.menu_options o
      join public.menu_item_option_groups l
        on l.group_id = o.group_id and l.restaurant_id = o.restaurant_id
      where o.id = (x->>'option_id')::uuid and o.restaurant_id = target_restaurant_id
        and o.group_id = (x->>'group_id')::uuid and o.is_available
        and l.menu_item_id = line_item)) then
    return false;
  end if;
  if exists (select 1 from public.menu_item_option_groups l
    join public.menu_option_groups g on g.id = l.group_id and g.restaurant_id = l.restaurant_id
    where l.restaurant_id = target_restaurant_id and l.menu_item_id = line_item
      and (select count(*) from jsonb_array_elements(selected) x where (x->>'group_id')::uuid = g.id)
        not between least(g.min_select, (select count(*) from public.menu_options o
                                          where o.group_id = g.id and o.restaurant_id = g.restaurant_id
                                            and o.is_available))
            and coalesce(g.max_select, 2147483647)) then
    return false;
  end if;
  select coalesce(sum(o.price_delta), 0) into delta_sum
    from jsonb_array_elements(selected) x
    join public.menu_options o on o.id = (x->>'option_id')::uuid and o.restaurant_id = target_restaurant_id;
  -- App prices are JavaScript sums (0.1 + 0.2 = 0.30000000000000004): compare in cents.
  return round(greatest(0, base_price + delta_sum), 2) = round((line->>'price')::numeric, 2);
exception when invalid_text_representation or numeric_value_out_of_range then
  return false;
end;
$$;
revoke all on function public.whatsapp_chat_line_is_current(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.whatsapp_chat_line_is_current(uuid, jsonb) to service_role;

-- Same signature and guarantees as the pilot: serialized with staff takeover,
-- revision checked, receipt committed with the order, one order per quote.
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
      response_text := 'The quote is no longer available or too many orders were submitted. No order was placed. Send CART for a fresh total with current availability and prices, or STAFF for help.';
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
      response_text := 'Order '||order_id::text||' received for takeaway. Payment is due at collection. The restaurant will confirm preparation. Send STAFF for changes, or NEW ORDER to start another order.';
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

-- Self-verification -------------------------------------------------------
do $verify_whatsapp_chat_ordering_v1$
begin
  if exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'whatsapp_order_parse_logs' and cmd <> 'SELECT') then
    raise exception 'whatsapp_order_parse_logs must remain service-role write only';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'whatsapp_order_parse_logs'
      and (roles @> array['public'::name] or roles @> array['anon'::name])) then
    raise exception 'whatsapp_order_parse_logs policies must target authenticated only';
  end if;
  if has_table_privilege('anon', 'public.whatsapp_order_parse_logs', 'select')
    or has_table_privilege('authenticated', 'public.whatsapp_order_parse_logs', 'insert')
    or has_table_privilege('authenticated', 'public.whatsapp_order_drafts', 'select')
    or has_function_privilege('authenticated',
      'public.apply_whatsapp_order_command(uuid,uuid,text,integer,jsonb,text,boolean,boolean)', 'execute')
    or has_function_privilege('authenticated', 'public.whatsapp_chat_line_is_current(uuid,jsonb)', 'execute') then
    raise exception 'WhatsApp chat ordering must stay service-role only';
  end if;
end;
$verify_whatsapp_chat_ordering_v1$;

notify pgrst, 'reload schema';
commit;
