begin;
insert into public.restaurants(id,name,slug,whatsapp_number,status,is_active)
values('29000000-0000-0000-0000-000000000001','Offline recovery','offline-recovery','971500000079','live',true);
insert into public.restaurant_shifts(id,restaurant_id,shift_name,status,opened_by_user_id,opened_at,
  closed_by_user_id,closed_at,cash_counted_amount,expected_cash_amount,difference_amount,completed_sales)
values('39000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000001','Original','closed',
  '19000000-0000-0000-0000-000000000001',now()-interval '2 hours',
  '19000000-0000-0000-0000-000000000001',now()-interval '10 minutes',100,100,0,100),
('39000000-0000-0000-0000-000000000002','29000000-0000-0000-0000-000000000001','Current','open',
  '19000000-0000-0000-0000-000000000001',now()-interval '10 minutes',null,null,null,null,null,0);

insert into public.orders(id,restaurant_id,customer_name,customer_phone,fulfilment_type,items,
  subtotal,delivery_fee,total,status,payment_method,whatsapp_message,consent_order_processing,
  consent_timestamp,punched_at,source,shift_id)
values
('49000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000001','Late paid','','takeaway','[]',
  3,0,3,'Completed','Cash on Delivery','test',true,now(),now()-interval '20 minutes','staff',
  '39000000-0000-0000-0000-000000000002'),
('49000000-0000-0000-0000-000000000002','29000000-0000-0000-0000-000000000001','Late unpaid','','takeaway','[]',
  4,0,4,'Preparing',null,'test',true,now(),now()-interval '20 minutes','staff',null),
('49000000-0000-0000-0000-000000000003','29000000-0000-0000-0000-000000000001','Current paid','','takeaway','[]',
  5,0,5,'Completed','Cash on Delivery','test',true,now(),now()-interval '1 minute','staff',null);

do $$ declare saved public.orders%rowtype; page jsonb; summary jsonb;
begin
  select * into saved from public.orders where id='49000000-0000-0000-0000-000000000001';
  if saved.shift_id <> '39000000-0000-0000-0000-000000000001' or not saved.late_shift_entry
    then raise exception 'Late payment was not attributed to original closed shift'; end if;
  if saved.closed_at <> saved.punched_at or saved.status_started_at <> saved.punched_at
    then raise exception 'Offline completion timestamps do not match submission'; end if;
  if (select completed_sales from public.restaurant_shifts where id=saved.shift_id) <> 100
    then raise exception 'Frozen closed-shift totals were rewritten'; end if;
  select * into saved from public.orders where id='49000000-0000-0000-0000-000000000002';
  if saved.shift_id is not null or saved.origin_shift_id <> '39000000-0000-0000-0000-000000000001'
    or saved.late_shift_entry then raise exception 'Unpaid order must await collection-shift assignment'; end if;
  if saved.status_started_at <> saved.punched_at then raise exception 'Offline wait was lost'; end if;
  page := public.get_admin_orders_page_v2('29000000-0000-0000-0000-000000000001','active','all',1,25,'overdue');
  if (page->'items'->0->>'order_started_at')::timestamptz <> saved.punched_at
    then raise exception 'Paged timer starts at receipt instead of punch'; end if;
  if (page->'items'->0->>'due_at')::timestamptz <> saved.punched_at + interval '20 minutes'
    then raise exception 'Overdue sorting ignores offline time'; end if;
  summary := public.calculate_restaurant_shift_summary('29000000-0000-0000-0000-000000000001','39000000-0000-0000-0000-000000000002');
  if (summary->>'completed_cash_order_total')::numeric <> 5
    then raise exception 'Previous shift cash leaked into current drawer'; end if;
  if public.order_start_time(now(),now()+interval '1 minute','staff') <> now()
    or public.order_start_time(now(),now()-interval '8 days','staff') <> now()
    or public.order_start_time(now(),now()-interval '20 minutes','customer') <> now()
    then raise exception 'Untrusted timestamps accepted'; end if;
  if has_function_privilege('authenticated','public.order_start_time(timestamptz,timestamptz,text)','execute')
    then raise exception 'Helper RPC exposed to browser role'; end if;
end $$;
rollback;
