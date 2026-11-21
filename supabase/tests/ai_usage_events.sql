\set ON_ERROR_STOP on

-- Per-restaurant AI usage (20261209090000_ai_usage_events.sql). Rollback-only.

begin;

insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active) values
  ('2c000000-0000-0000-0000-000000000001', 'Usage A', 'ai-usage-a', '971500000401', 'live', true),
  ('2c000000-0000-0000-0000-000000000002', 'Usage B', 'ai-usage-b', '971500000402', 'live', true);

insert into public.ai_usage_events
  (restaurant_id, feature, model, input_tokens, output_tokens, thinking_tokens, estimated_cost_usd, created_at)
values
  ('2c000000-0000-0000-0000-000000000001', 'chatbot_reply', 'gemini-2.5-flash', 2000, 100, 0, 0.00085, now()),
  ('2c000000-0000-0000-0000-000000000001', 'chatbot_reply', 'gemini-2.5-flash', 3000, 200, 0, 0.0014, now()),
  ('2c000000-0000-0000-0000-000000000001', 'menu_image', 'gemini-2.5-flash-image', 300, 1290, 0, 0.0388, now()),
  ('2c000000-0000-0000-0000-000000000001', 'chatbot_reply', 'some-future-model', 10, 5, 0, null, now()),
  -- Outside the window.
  ('2c000000-0000-0000-0000-000000000001', 'chatbot_reply', 'gemini-2.5-flash', 9999, 9999, 0, 9.99, now() - interval '40 days'),
  ('2c000000-0000-0000-0000-000000000002', 'daily_summary', 'gemini-2.5-flash', 500, 80, 0, 0.00035, now()),
  (null, 'menu_extract', 'gemini-2.5-flash', 4000, 900, 0, 0.00345, now());

do $ai_usage_checks$
declare
  chatbot record;
  every_restaurant integer;
begin
  -- Totals for one restaurant and feature, inside the window only.
  select * into chatbot
  from public.get_ai_usage_summary(now() - interval '30 days', '2c000000-0000-0000-0000-000000000001')
  where feature = 'chatbot_reply';
  if chatbot.calls <> 3 or chatbot.input_tokens <> 5010 or chatbot.unpriced_calls <> 1
     or chatbot.estimated_cost_usd <> 0.00225 then
    raise exception 'chatbot totals wrong: %', row_to_json(chatbot);
  end if;

  -- A single restaurant's view never includes another tenant.
  if exists (
    select 1 from public.get_ai_usage_summary(now() - interval '30 days', '2c000000-0000-0000-0000-000000000001')
    where restaurant_id is distinct from '2c000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Restaurant-scoped summary leaked another tenant';
  end if;

  -- The all-restaurants view includes the unattributed (/try demo) bucket.
  select count(distinct coalesce(restaurant_id::text, 'none')) into every_restaurant
  from public.get_ai_usage_summary(now() - interval '30 days')
  where restaurant_id in ('2c000000-0000-0000-0000-000000000001', '2c000000-0000-0000-0000-000000000002')
     or restaurant_id is null;
  if every_restaurant <> 3 then
    raise exception 'Expected A, B and unattributed buckets, got %', every_restaurant;
  end if;

  -- Bad data is rejected.
  begin
    insert into public.ai_usage_events (restaurant_id, feature, model) values (null, 'not_a_feature', 'm');
    raise exception 'Unknown feature accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.ai_usage_events (restaurant_id, feature, model, input_tokens) values (null, 'order_parse', 'm', -1);
    raise exception 'Negative token count accepted';
  exception when check_violation then null;
  end;

  -- Usage goes with the restaurant when it is deleted (FK is ON DELETE CASCADE).
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ai_usage_events'::regclass
      and confrelid = 'public.restaurants'::regclass
      and contype = 'f'
      and confdeltype = 'c'
  ) then
    raise exception 'ai_usage_events.restaurant_id must cascade on restaurant deletion';
  end if;

  -- Internal data: no browser access at all.
  if has_table_privilege('authenticated', 'public.ai_usage_events', 'select')
     or has_table_privilege('anon', 'public.ai_usage_events', 'select')
     or has_function_privilege('authenticated', 'public.get_ai_usage_summary(timestamptz, uuid)', 'execute')
     or has_function_privilege('anon', 'public.get_ai_usage_summary(timestamptz, uuid)', 'execute') then
    raise exception 'Browser roles must not read AI usage';
  end if;
end;
$ai_usage_checks$;

rollback;
