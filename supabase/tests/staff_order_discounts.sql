begin;
insert into public.restaurants(id,name,slug,whatsapp_number,status,is_active,accepting_orders,pickup_enabled,minimum_order_amount)
values('29400000-0000-0000-0000-000000000001','Discount cafe','discount-cafe','971500000191','live',true,true,true,0),
      ('29400000-0000-0000-0000-000000000002','Other discount cafe','discount-cafe-other','971500000192','live',true,true,true,0);
insert into auth.users(id,email) values ('39400000-0000-0000-0000-000000000001','manager@example.test');
insert into public.orders (id, restaurant_id, customer_name, customer_phone, fulfilment_type, payment_method,
  items, subtotal, delivery_fee, total, status, whatsapp_message, consent_order_processing, consent_timestamp, source)
values
  ('49400000-0000-0000-0000-000000000001','29400000-0000-0000-0000-000000000001','Open ticket','971500000001','delivery',null,'[{"item_id":"a","name":"Tea","price":20,"quantity":5}]',100,10,110,'Preparing','x',true,now(),'staff'),
  ('49400000-0000-0000-0000-000000000002','29400000-0000-0000-0000-000000000001','Paid ticket','971500000002','takeaway','Cash on Delivery','[]',50,0,50,'Completed','x',true,now(),'staff'),
  ('49400000-0000-0000-0000-000000000003','29400000-0000-0000-0000-000000000002','Other tenant','971500000003','takeaway',null,'[]',50,0,50,'Preparing','x',true,now(),'staff');

do $$ declare
  r uuid := '29400000-0000-0000-0000-000000000001';
  o uuid := '49400000-0000-0000-0000-000000000001';
  actor uuid := '39400000-0000-0000-0000-000000000001';
  result jsonb;
  failed boolean;
begin
  -- Staff: 10% default cap. 15% is refused, 10% is accepted.
  failed := false;
  begin perform public.apply_order_discount(r, o, 'percent', 15, 'Regular', actor, 'staff');
  exception when others then failed := sqlerrm like '%staff limit%'; end;
  if not failed then raise exception 'staff cap not enforced'; end if;

  result := public.apply_order_discount(r, o, 'percent', 10, 'Regular', actor, 'staff');
  if (result->>'discount_amount')::numeric <> 10 or (result->>'total')::numeric <> 100 then
    raise exception 'percent discount wrong: %', result; end if;

  -- Discount applies to subtotal only; delivery fee is kept.
  result := public.apply_order_discount(r, o, 'fixed', 250, 'Complaint', actor, 'manager');
  if (result->>'discount_amount')::numeric <> 100 or (result->>'total')::numeric <> 10 then
    raise exception 'fixed discount should cap at subtotal: %', result; end if;

  -- Items cannot change under a discount.
  failed := false;
  begin update public.orders set subtotal = 120, total = 130 where id = o;
  exception when others then failed := sqlerrm like '%Remove the discount%'; end;
  if not failed then raise exception 'items guard missing'; end if;

  -- A reason is mandatory.
  failed := false;
  begin perform public.apply_order_discount(r, o, 'percent', 5, '  ', actor, 'owner');
  exception when others then failed := sqlerrm like '%reason%'; end;
  if not failed then raise exception 'reason not required'; end if;

  -- Removing restores the undiscounted total.
  result := public.apply_order_discount(r, o, null, null, null, actor, 'staff');
  if (result->>'discount_amount')::numeric <> 0 or (result->>'total')::numeric <> 110
     or result->>'discount_type' is not null then
    raise exception 'remove discount wrong: %', result; end if;

  -- Paid orders and other tenants' orders are refused.
  failed := false;
  begin perform public.apply_order_discount(r, '49400000-0000-0000-0000-000000000002', 'percent', 5, 'x', actor, 'owner');
  exception when others then failed := sqlerrm like '%cannot be discounted%'; end;
  if not failed then raise exception 'paid order was discounted'; end if;

  failed := false;
  begin perform public.apply_order_discount(r, '49400000-0000-0000-0000-000000000003', 'percent', 5, 'x', actor, 'owner');
  exception when others then failed := sqlerrm like '%Order not found%'; end;
  if not failed then raise exception 'cross-tenant discount allowed'; end if;

  -- Every change is audited (10%, fixed, removal).
  if (select count(*) from public.order_discount_events where order_id = o) <> 3 then
    raise exception 'discount audit rows missing'; end if;

  -- A discounted row whose total does not reconcile is rejected.
  failed := false;
  begin
    update public.orders set discount_type = 'fixed', discount_value = 5, discount_amount = 5,
      discount_reason = 'x', total = 110 where id = o;
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'unreconciled total accepted'; end if;

  -- The order queue exposes the discount fields.
  perform public.apply_order_discount(r, o, 'fixed', 5, 'Staff meal', actor, 'owner');
  result := public.get_admin_orders_page_v4(r, 'active', 'all', 1, 25, 'oldest', null, 'all');
  if (result->'items'->0->>'discount_amount')::numeric <> 5
     or result->'items'->0->>'discount_reason' <> 'Staff meal' then
    raise exception 'queue missing discount: %', result; end if;
end $$;

do $$ begin
  if has_function_privilege('anon', 'public.apply_order_discount(uuid, uuid, text, numeric, text, uuid, text)', 'execute')
    or has_function_privilege('authenticated', 'public.apply_order_discount(uuid, uuid, text, numeric, text, uuid, text)', 'execute') then
    raise exception 'apply_order_discount must stay service-role only';
  end if;
end $$;
rollback;
