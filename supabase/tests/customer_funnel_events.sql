begin;
insert into public.restaurants(id,name,slug,whatsapp_number,status,is_active)
values('29000000-0000-0000-0000-000000000001','Funnel A','funnel-a','971500000091','live',true),
('29000000-0000-0000-0000-000000000002','Funnel B','funnel-b','971500000092','live',true);

-- One step per visit: a retried beacon must not double count.
insert into public.customer_funnel_events(restaurant_id,session_id,event_name)
values('29000000-0000-0000-0000-000000000001','sessionAAAAAAAAAAAA1','menu_view'),
('29000000-0000-0000-0000-000000000001','sessionAAAAAAAAAAAA1','checkout_view'),
('29000000-0000-0000-0000-000000000001','sessionAAAAAAAAAAAA2','menu_view'),
('29000000-0000-0000-0000-000000000002','sessionBBBBBBBBBBBB1','menu_view');
insert into public.customer_funnel_events(restaurant_id,session_id,event_name)
values('29000000-0000-0000-0000-000000000001','sessionAAAAAAAAAAAA1','menu_view')
on conflict on constraint customer_funnel_events_once_per_visit do nothing;
-- A saved order the restaurant accepted, and one it has not.
insert into public.orders(id,restaurant_id,customer_name,customer_phone,fulfilment_type,items,subtotal,delivery_fee,total,status,whatsapp_message,consent_order_processing,consent_timestamp)
values('49000000-0000-4000-8000-000000000001','29000000-0000-0000-0000-000000000001','Funnel','971500000091','takeaway','[]',5,0,5,'Accepted','t',true,now()),
('49000000-0000-4000-8000-000000000002','29000000-0000-0000-0000-000000000001','Funnel','971500000091','takeaway','[]',5,0,5,'New','t',true,now());
insert into public.customer_funnel_events(restaurant_id,session_id,event_name,order_key)
values('29000000-0000-0000-0000-000000000001','sessionAAAAAAAAAAAA2','order_saved','49000000-0000-4000-8000-000000000002');
-- Two different orders in one visit are two events.
insert into public.customer_funnel_events(restaurant_id,session_id,event_name,order_key)
values('29000000-0000-0000-0000-000000000001','sessionAAAAAAAAAAAA1','order_saved','49000000-0000-4000-8000-000000000001'),
('29000000-0000-0000-0000-000000000001','sessionAAAAAAAAAAAA1','order_saved','49000000-0000-4000-8000-000000000002');

do $$ declare menu_visits bigint; saved bigint;
begin
  select sessions into menu_visits from public.customer_funnel_summary('29000000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 minute') where event_name='menu_view';
  if menu_visits <> 2 then raise exception 'Expected 2 menu visits, got %', menu_visits; end if;
  select sessions into saved from public.customer_funnel_summary('29000000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 minute') where event_name='order_saved';
  if saved <> 2 then raise exception 'order_saved must count visits, got %', saved; end if;
  if (select sessions from public.customer_funnel_summary('29000000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 minute') where event_name='order_accepted') <> 1 then raise exception 'Accepted step must follow the real order status'; end if;
  if exists(select 1 from public.customer_funnel_summary('29000000-0000-0000-0000-000000000001', now() + interval '1 hour', now() + interval '2 hours') where sessions > 0) then raise exception 'Range end ignored'; end if;
  if (select count(*) from public.customer_funnel_events where restaurant_id='29000000-0000-0000-0000-000000000001' and event_name='menu_view') <> 2 then raise exception 'Duplicate step stored'; end if;
  if (select coalesce(sum(sessions), 0) from public.customer_funnel_summary('29000000-0000-0000-0000-000000000002', now() - interval '1 day', now() + interval '1 minute')) <> 1 then raise exception 'Summary crossed tenant'; end if;
  if has_function_privilege('authenticated','public.customer_funnel_summary(uuid,timestamptz,timestamptz)','execute') then raise exception 'Browser can call funnel summary'; end if;
  if has_function_privilege('anon','public.customer_funnel_summary(uuid,timestamptz,timestamptz)','execute') then raise exception 'Anon can call funnel summary'; end if;
  if has_table_privilege('anon','public.customer_funnel_events','insert') or has_table_privilege('authenticated','public.customer_funnel_events','insert') then raise exception 'Browser can write funnel events'; end if;
end $$;

-- Rejects junk: unknown events, malformed sessions, free text in detail.
do $$ begin
  begin
    insert into public.customer_funnel_events(restaurant_id,session_id,event_name) values('29000000-0000-0000-0000-000000000001','sessionAAAAAAAAAAAA9','page_hack');
    raise exception 'Unknown event accepted';
  exception when check_violation then null; end;
  begin
    insert into public.customer_funnel_events(restaurant_id,session_id,event_name) values('29000000-0000-0000-0000-000000000001','short','menu_view');
    raise exception 'Malformed session accepted';
  exception when check_violation then null; end;
  begin
    insert into public.customer_funnel_events(restaurant_id,session_id,event_name,detail) values('29000000-0000-0000-0000-000000000001','sessionAAAAAAAAAAAA9','checkout_blocked','Call me on 0501234567');
    raise exception 'Free text accepted in detail';
  exception when check_violation then null; end;
end $$;

-- Anonymous browsers can neither read nor write events.
set local role anon;
do $$ begin
  if exists(select 1 from public.customer_funnel_events) then raise exception 'Anon read funnel events'; end if;
exception when insufficient_privilege then null;
end $$;
reset role;
rollback;
