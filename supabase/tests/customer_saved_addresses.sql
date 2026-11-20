\set ON_ERROR_STOP on
-- Customer saved addresses (20261129090000). Rollback-only.
begin;

insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active, accepting_orders)
values ('29600000-0000-0000-0000-000000000001', 'Address cafe', 'address-cafe', '971500000296', 'live', true, true),
       ('29600000-0000-0000-0000-000000000002', 'Other address cafe', 'address-cafe-other', '971500000297', 'live', true, true);

-- Same phone at two cafés: two separate customers (per-tenant data).
insert into public.customers (id, restaurant_id, name, phone, delivery_area, delivery_address)
values ('39600000-0000-0000-0000-000000000001', '29600000-0000-0000-0000-000000000001', 'Sara', '971500000101', '', ''),
       ('39600000-0000-0000-0000-000000000002', '29600000-0000-0000-0000-000000000002', 'Sara', '971500000101', '', ''),
       ('39600000-0000-0000-0000-000000000003', '29600000-0000-0000-0000-000000000001', 'Omar', '971500000102', '', '');

create function pg_temp.save(phone text, address uuid, label text, details text,
  make_default boolean default false,
  restaurant uuid default '29600000-0000-0000-0000-000000000001',
  lat numeric default null, lng numeric default null)
returns jsonb language sql as $$
  select public.save_customer_address(restaurant, phone, address, label, 'Al Nahda', '', '', details, '', lat, lng, make_default)
$$;

do $$ declare
  cafe uuid := '29600000-0000-0000-0000-000000000001';
  other_cafe uuid := '29600000-0000-0000-0000-000000000002';
  home uuid;
  work uuid;
  result jsonb;
  list jsonb;
  i integer;
begin
  -- Unknown customer.
  result := pg_temp.save('971500000999', null, 'Home', 'Villa 1');
  if result->>'reason' <> 'customer_not_found' then raise exception 'unknown customer: %', result; end if;

  -- First address becomes default even without asking.
  result := pg_temp.save('971500000101', null, ' Home ', 'Villa 1');
  home := (result->>'id')::uuid;
  if not (result->>'ok')::boolean then raise exception 'first save failed: %', result; end if;
  if not (select is_default from public.customer_addresses where id = home) then
    raise exception 'first address not default'; end if;
  if (select label from public.customer_addresses where id = home) <> 'Home' then
    raise exception 'label not trimmed'; end if;

  -- Second address is not default unless asked; then it takes over.
  work := (pg_temp.save('971500000101', null, 'Work', 'Tower 2')->>'id')::uuid;
  if (select is_default from public.customer_addresses where id = work) then
    raise exception 'second address became default'; end if;
  result := public.set_default_customer_address(cafe, '971500000101', work);
  if (select count(*) from public.customer_addresses where customer_id = '39600000-0000-0000-0000-000000000001' and is_default) <> 1
     or not (select is_default from public.customer_addresses where id = work) then
    raise exception 'set default wrong'; end if;

  -- Saving with make_default moves it back.
  perform pg_temp.save('971500000101', home, 'Home', 'Villa 1A', true);
  if not (select is_default from public.customer_addresses where id = home)
     or (select details from public.customer_addresses where id = home) <> 'Villa 1A' then
    raise exception 'update with default wrong'; end if;

  -- Read: default first, scoped to café + phone.
  list := public.get_customer_addresses(cafe, '971500000101');
  if jsonb_array_length(list) <> 2 or (list->0->>'id')::uuid <> home then
    raise exception 'list wrong: %', list; end if;
  if jsonb_array_length(public.get_customer_addresses(other_cafe, '971500000101')) <> 0 then
    raise exception 'addresses leaked to another cafe'; end if;
  if jsonb_array_length(public.get_customer_addresses(cafe, '971500000102')) <> 0 then
    raise exception 'addresses leaked to another customer'; end if;

  -- Another customer, or the same phone at another café, cannot touch them.
  if pg_temp.save('971500000102', home, 'Mine', 'x')->>'reason' <> 'not_found' then
    raise exception 'other customer updated an address'; end if;
  if pg_temp.save('971500000101', home, 'Mine', 'x', false, other_cafe)->>'reason' <> 'not_found' then
    raise exception 'other cafe updated an address'; end if;
  if public.set_default_customer_address(cafe, '971500000102', work)->>'reason' <> 'not_found' then
    raise exception 'other customer set default'; end if;
  if public.delete_customer_address(other_cafe, '971500000101', work)->>'reason' <> 'not_found' then
    raise exception 'other cafe deleted an address'; end if;

  -- Validation: empty label, empty address, half coordinates, bad latitude.
  if pg_temp.save('971500000101', null, '  ', 'Villa')->>'reason' <> 'invalid' then raise exception 'empty label accepted'; end if;
  if public.save_customer_address(cafe, '971500000101', null, 'Blank', '', '', '', '', '', null, null, false)->>'reason' <> 'invalid' then
    raise exception 'empty address accepted'; end if;
  if pg_temp.save('971500000101', null, 'Half', 'x', false, cafe, 25.2, null)->>'reason' <> 'invalid' then
    raise exception 'half coordinates accepted'; end if;
  if pg_temp.save('971500000101', null, 'Bad', 'x', false, cafe, 95, 55)->>'reason' <> 'invalid' then
    raise exception 'bad latitude accepted'; end if;
  -- A pin alone is a valid address.
  if not (public.save_customer_address(cafe, '971500000101', null, 'Pin', '', '', '', '', '', 25.2, 55.3, false)->>'ok')::boolean then
    raise exception 'pin-only address refused'; end if;

  -- Limit: 10 per customer (3 saved so far).
  for i in 1..7 loop
    perform pg_temp.save('971500000101', null, 'Extra ' || i, 'x');
  end loop;
  if pg_temp.save('971500000101', null, 'Eleventh', 'x')->>'reason' <> 'limit_reached' then
    raise exception 'limit not enforced'; end if;

  -- Deleting the default promotes another one.
  result := public.delete_customer_address(cafe, '971500000101', home);
  if not (result->>'ok')::boolean then raise exception 'delete failed: %', result; end if;
  if (select count(*) from public.customer_addresses where customer_id = '39600000-0000-0000-0000-000000000001' and is_default) <> 1 then
    raise exception 'no default after deleting the default'; end if;
  if public.delete_customer_address(cafe, '971500000101', home)->>'reason' <> 'not_found' then
    raise exception 'double delete not reported'; end if;

  -- Deleting the customer removes their addresses.
  delete from public.customers where id = '39600000-0000-0000-0000-000000000001';
  if exists (select 1 from public.customer_addresses where customer_id = '39600000-0000-0000-0000-000000000001') then
    raise exception 'addresses survived customer deletion'; end if;
end $$;

-- Browser roles: no function access, no writes.
do $$ begin
  if has_function_privilege('anon', 'public.get_customer_addresses(uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.save_customer_address(uuid,text,uuid,text,text,text,text,text,text,numeric,numeric,boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.delete_customer_address(uuid,text,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.set_default_customer_address(uuid,text,uuid)', 'execute') then
    raise exception 'address functions are callable by browser roles';
  end if;
  if has_table_privilege('authenticated', 'public.customer_addresses', 'insert')
     or has_table_privilege('anon', 'public.customer_addresses', 'select') then
    raise exception 'customer_addresses grants too broad';
  end if;
end $$;

rollback;
