-- Rollback-only: unbilled sales balance the drawer and appear in the report.
begin;

insert into auth.users (id, email, role, aud, created_at, updated_at)
values ('19300000-0000-0000-0000-000000000001', 'unbilled@test.invalid',
  'authenticated', 'authenticated', now(), now()),
  ('19300000-0000-0000-0000-000000000002', 'unbilled-staff@test.invalid',
  'authenticated', 'authenticated', now(), now());
insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active)
values ('29300000-0000-0000-0000-000000000001', 'Unbilled test',
  'unbilled-test', '971500000391', 'live', true);
insert into public.restaurant_users (restaurant_id, user_id, email, role, accepted_at)
values ('29300000-0000-0000-0000-000000000001',
  '19300000-0000-0000-0000-000000000001', 'unbilled@test.invalid', 'manager', now()),
  ('29300000-0000-0000-0000-000000000001',
  '19300000-0000-0000-0000-000000000002', 'unbilled-staff@test.invalid', 'staff', now());

do $unbilled$
declare
  r constant uuid := '29300000-0000-0000-0000-000000000001';
  manager constant uuid := '19300000-0000-0000-0000-000000000001';
  staff constant uuid := '19300000-0000-0000-0000-000000000002';
  sid uuid;
  cash_entry uuid;
  summary jsonb;
  report jsonb;
begin
  sid := public.open_restaurant_shift_v3(r, 'Morning', 10, null, null, manager);

  -- Bank transfer, "other", and UPI outside India are refused.
  begin
    perform public.add_shift_other_income(r, sid, 'unbilled_sale', 5, 'bank_transfer', 'Tea', null, manager);
    raise exception 'Unbilled sale accepted a bank transfer';
  exception when others then
    if sqlerrm not like '%cash, card or UPI%' then raise; end if;
  end;
  begin
    perform public.add_shift_other_income(r, sid, 'unbilled_sale', 5, 'upi', 'Tea', null, manager);
    raise exception 'Unbilled UPI accepted outside India';
  exception when others then
    if sqlerrm not like '%cash, card or UPI%' then raise; end if;
  end;
  -- Staff who didn't open the shift can't record one.
  begin
    perform public.add_shift_other_income(r, sid, 'unbilled_sale', 5, 'cash', 'Tea', null, staff);
    raise exception 'Non-opener staff recorded an unbilled sale';
  exception when others then
    if sqlerrm not like '%Only the shift opener or restaurant management%' then raise; end if;
  end;

  cash_entry := public.add_shift_other_income(r, sid, 'unbilled_sale', 12, 'cash', 'Walk-in teas, no bill', null, manager);
  perform public.add_shift_other_income(r, sid, 'unbilled_sale', 8, 'card', 'Card, no bill', null, manager);
  perform public.add_shift_other_income(r, sid, 'used_oil_sale', 5, 'cash', 'Oil', null, manager);

  -- Expected cash = 10 opening + 12 unbilled cash + 5 oil; card expects 8.
  summary := public.calculate_restaurant_shift_summary(r, sid);
  if (summary->>'expected_cash_amount')::numeric <> 27
     or (summary->>'card_on_delivery_total')::numeric <> 8
     or (summary->'other_income_breakdown'->>'unbilled_sale')::numeric <> 20
     or (summary->>'completed_sales')::numeric <> 0 then
    raise exception 'Unbilled sales did not reach the drawer totals: %', summary;
  end if;

  -- A mistaken one can be voided while the shift is open.
  perform public.void_shift_other_income(r, sid, cash_entry, 'Entered twice', manager);
  summary := public.calculate_restaurant_shift_summary(r, sid);
  if (summary->>'expected_cash_amount')::numeric <> 15 then
    raise exception 'Voided unbilled sale still counted: %', summary;
  end if;
  perform public.add_shift_other_income(r, sid, 'unbilled_sale', 12, 'cash', 'Walk-in teas, no bill', null, manager);

  perform public.close_restaurant_shift_v4(r, sid, 27, 8, null, '[]'::jsonb, null, manager);
  select snapshot into report from public.shift_close_reports where shift_id = sid and version = 1;
  if (report->>'cash_difference_amount')::numeric <> 0
     or (report->>'card_difference_amount')::numeric <> 0
     or (report->'other_income_breakdown'->>'unbilled_sale')::numeric <> 20
     or (select count(*) from jsonb_array_elements(report->'other_income_entries') e
         where e->>'category' = 'unbilled_sale' and e->>'voided_at' is null) <> 2
     or (select count(*) from jsonb_array_elements(report->'other_income_entries') e
         where e->>'category' = 'unbilled_sale' and e->>'voided_at' is not null) <> 1 then
    raise exception 'Report does not reconcile unbilled sales: %', report;
  end if;
end;
$unbilled$;

rollback;
