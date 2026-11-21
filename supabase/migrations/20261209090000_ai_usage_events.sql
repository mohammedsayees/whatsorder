-- Per-restaurant AI usage and estimated cost.
--
-- One row per Gemini call, written server-side (service role) from the
-- token counts Google returns (usageMetadata). Estimated cost is computed in
-- the app from list prices (src/lib/ai/usage.ts) at the time of the call, so
-- later price changes don't rewrite history.
--
-- restaurant_id is null only for calls made before a restaurant exists
-- (the public /try menu-import demo).
--
-- Internal data: service-role only. RLS is on with no policies and browser
-- roles have no privileges, like the tables in
-- 20261115090000_tenant_isolation_hardening.sql. The super-admin view reads it
-- server-side.

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  feature text not null check (feature in (
    'chatbot_reply',
    'order_parse',
    'daily_summary',
    'poster_copy',
    'poster_art',
    'menu_image',
    'menu_extract',
    'menu_descriptions',
    'menu_translate',
    'finance_extract'
  )),
  model text not null check (char_length(model) between 1 and 100),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  thinking_tokens integer not null default 0 check (thinking_tokens >= 0),
  -- null when the model has no known price (cost is then unknown, not zero).
  estimated_cost_usd numeric(12, 6) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_events_restaurant_created
  on public.ai_usage_events (restaurant_id, created_at desc);

create index if not exists idx_ai_usage_events_created
  on public.ai_usage_events (created_at desc);

alter table public.ai_usage_events enable row level security;
revoke all on table public.ai_usage_events from public, anon, authenticated;
grant all on table public.ai_usage_events to service_role;

-- Per restaurant x feature totals since a point in time, for the super-admin
-- billing view. Aggregates in the database so the view stays cheap as usage
-- grows. target_restaurant_id limits it to one restaurant; null returns every
-- restaurant plus the unattributed (/try demo) bucket.
create or replace function public.get_ai_usage_summary(
  since timestamptz,
  target_restaurant_id uuid default null
)
returns table (
  restaurant_id uuid,
  feature text,
  calls bigint,
  input_tokens bigint,
  output_tokens bigint,
  thinking_tokens bigint,
  estimated_cost_usd numeric,
  unpriced_calls bigint
)
language sql
stable
set search_path to ''
as $function$
  select
    usage.restaurant_id,
    usage.feature,
    count(*) as calls,
    coalesce(sum(usage.input_tokens), 0) as input_tokens,
    coalesce(sum(usage.output_tokens), 0) as output_tokens,
    coalesce(sum(usage.thinking_tokens), 0) as thinking_tokens,
    coalesce(sum(usage.estimated_cost_usd), 0) as estimated_cost_usd,
    count(*) filter (where usage.estimated_cost_usd is null) as unpriced_calls
  from public.ai_usage_events usage
  where usage.created_at >= since
    and (target_restaurant_id is null or usage.restaurant_id = target_restaurant_id)
  group by usage.restaurant_id, usage.feature;
$function$;

revoke all on function public.get_ai_usage_summary(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.get_ai_usage_summary(timestamptz, uuid) to service_role;

do $verify_ai_usage_events$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.ai_usage_events'::regclass) then
    raise exception 'ai_usage_events must have RLS enabled';
  end if;
  if has_table_privilege('anon', 'public.ai_usage_events', 'select')
     or has_table_privilege('authenticated', 'public.ai_usage_events', 'select')
     or has_table_privilege('authenticated', 'public.ai_usage_events', 'insert') then
    raise exception 'Browser roles must not access ai_usage_events';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_usage_events') then
    raise exception 'ai_usage_events must be service-role only (no policies)';
  end if;
  if has_function_privilege('anon', 'public.get_ai_usage_summary(timestamptz, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.get_ai_usage_summary(timestamptz, uuid)', 'execute') then
    raise exception 'Browser roles must not call get_ai_usage_summary';
  end if;
end;
$verify_ai_usage_events$;
