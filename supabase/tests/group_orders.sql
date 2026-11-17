begin;
insert into public.restaurants(id,name,slug,whatsapp_number,status,is_active)
values('2b000000-0000-0000-0000-000000000001','Group A','group-a','971500000094','live',true),
('2b000000-0000-0000-0000-000000000002','Group B','group-b','971500000095','live',true);

insert into public.group_carts(id,restaurant_id,share_token,organiser_token_hash,organiser_name)
values('5b000000-0000-4000-8000-000000000001','2b000000-0000-0000-0000-000000000001',
  'shareTokenAAAAAAAAAAAAAAAAAA', repeat('a',64), 'Sara');

insert into public.group_cart_lines(group_cart_id,restaurant_id,participant_id,participant_name,line)
values('5b000000-0000-4000-8000-000000000001','2b000000-0000-0000-0000-000000000001',
  'participantAAAAAAAAA','Ahmed','{"item_id":"x","name":"Karak","price":2,"quantity":2}');

do $$ begin
  if (select status from public.group_carts where id='5b000000-0000-4000-8000-000000000001') <> 'open' then
    raise exception 'Groups must start open';
  end if;
  if (select expires_at - created_at from public.group_carts where id='5b000000-0000-4000-8000-000000000001') <> interval '2 hours' then
    raise exception 'Groups must expire after two hours';
  end if;
  -- A line cannot point at another restaurant's group.
  begin
    insert into public.group_cart_lines(group_cart_id,restaurant_id,participant_id,participant_name,line)
    values('5b000000-0000-4000-8000-000000000001','2b000000-0000-0000-0000-000000000002','participantBBBBBBBBB','Eve','{}');
    raise exception 'Cross-tenant group line accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.group_carts(restaurant_id,share_token,organiser_token_hash,organiser_name)
    values('2b000000-0000-0000-0000-000000000001','short','nothex','Sara');
    raise exception 'Weak share token accepted';
  exception when check_violation then null; end;
  begin
    insert into public.group_cart_lines(group_cart_id,restaurant_id,participant_id,participant_name,line)
    values('5b000000-0000-4000-8000-000000000001','2b000000-0000-0000-0000-000000000001','participantAAAAAAAAA',repeat('n',31),'{}');
    raise exception 'Overlong participant name accepted';
  exception when check_violation then null; end;
  begin
    update public.group_carts set status='paid' where id='5b000000-0000-4000-8000-000000000001';
    raise exception 'Unknown group status accepted';
  exception when check_violation then null; end;
  if has_table_privilege('anon','public.group_carts','insert') or has_table_privilege('authenticated','public.group_carts','insert')
     or has_table_privilege('anon','public.group_cart_lines','insert') or has_table_privilege('authenticated','public.group_cart_lines','insert')
     or has_table_privilege('anon','public.group_carts','select') then
    raise exception 'Browsers must not write or anonymously read group carts';
  end if;
end $$;

-- Deleting a group removes its lines.
delete from public.group_carts where id='5b000000-0000-4000-8000-000000000001';
do $$ begin
  if exists(select 1 from public.group_cart_lines where group_cart_id='5b000000-0000-4000-8000-000000000001') then
    raise exception 'Group lines survived group deletion';
  end if;
end $$;
rollback;
