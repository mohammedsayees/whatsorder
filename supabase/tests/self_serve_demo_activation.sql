-- Run after all migrations. Structural/privilege checks roll back cleanly and
-- complement the application tests for the cookie and invitation handoff.
begin;

do $self_serve_demo_activation_test$
declare
  transition_definition text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'restaurants'
      and column_name = 'activated_at'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'restaurants'
      and column_name = 'activation_order_id'
  ) then
    raise exception 'Durable restaurant activation fields are missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'is_demo'
  ) then
    raise exception 'Order demo-origin marker is missing';
  end if;

  if has_table_privilege('anon', 'public.demo_restaurant_claims', 'select')
     or has_table_privilege('authenticated', 'public.demo_restaurant_claims', 'select') then
    raise exception 'Browser roles can read demo claim proofs';
  end if;

  if has_function_privilege(
    'anon',
    'public.claim_demo_restaurant(uuid,text,text,text,text,text,text,text,text)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.claim_demo_restaurant(uuid,text,text,text,text,text,text,text,text)',
    'execute'
  ) then
    raise exception 'Browser roles can execute the demo claim RPC';
  end if;

  select pg_get_functiondef(
    'public.transition_order_status_and_record_event(uuid,uuid,text,uuid,text,text)'::regprocedure
  ) into transition_definition;

  if position('orders.is_demo = false' in transition_definition) = 0
     or position('restaurants.activated_at is null' in transition_definition) = 0
     or position('task_key = ''test_order''' in transition_definition) = 0 then
    raise exception 'Accepted-order activation guards are incomplete';
  end if;
end;
$self_serve_demo_activation_test$;

rollback;
