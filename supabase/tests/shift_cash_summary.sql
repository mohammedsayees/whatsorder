\set ON_ERROR_STOP on

-- Rollback-only integration checks for Shift Cash Summary.
begin;

insert into auth.users (id, email, role, aud, created_at, updated_at)
values (
  '12000000-0000-0000-0000-000000000001',
  'shift-staff@test.invalid',
  'authenticated',
  'authenticated',
  now(),
  now()
);

insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active)
values
  ('22000000-0000-0000-0000-000000000001', 'Shift Tenant A', 'shift-a', '971500000021', 'live', true),
  ('22000000-0000-0000-0000-000000000002', 'Shift Tenant B', 'shift-b', '971500000022', 'live', true);

insert into public.restaurant_shifts (
  id,
  restaurant_id,
  shift_name,
  opening_cash_amount,
  opened_by_user_id
)
values (
  '82000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  'Morning',
  100,
  '12000000-0000-0000-0000-000000000001'
);

do $one_open_shift$
declare
  actor_id uuid;
begin
  select opened_by_user_id
  into actor_id
  from public.restaurant_shifts
  where id = '82000000-0000-0000-0000-000000000001';

  begin
    insert into public.restaurant_shifts (
      restaurant_id,
      shift_name,
      opening_cash_amount,
      opened_by_user_id
    )
    values (
      '22000000-0000-0000-0000-000000000001',
      'Duplicate open shift',
      0,
      actor_id
    );
    raise exception 'Second open shift unexpectedly succeeded';
  exception
    when unique_violation then null;
  end;
end;
$one_open_shift$;

insert into public.restaurant_shifts (
  id,
  restaurant_id,
  shift_name,
  opening_cash_amount,
  opened_by_user_id
)
values (
  '82000000-0000-0000-0000-000000000002',
  '22000000-0000-0000-0000-000000000002',
  'Tenant B morning',
  50,
  '12000000-0000-0000-0000-000000000001'
);

insert into public.orders (
  id,
  restaurant_id,
  customer_name,
  customer_phone,
  payment_method,
  items,
  subtotal,
  delivery_fee,
  total,
  whatsapp_message,
  consent_order_processing,
  consent_timestamp
)
values (
  '42000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  'Shift customer',
  '971500000031',
  'Cash on Delivery',
  '[]'::jsonb,
  25,
  0,
  25,
  'test',
  true,
  now()
);

do $cross_tenant_shift$
begin
  begin
    update public.orders
    set shift_id = '82000000-0000-0000-0000-000000000002'
    where id = '42000000-0000-0000-0000-000000000001';
    raise exception 'Cross-tenant shift assignment unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;
end;
$cross_tenant_shift$;

do $constraint_checks$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_restaurant_shifts_one_open'
      and indexdef ilike '%where (status = ''open''%'
  ) then
    raise exception 'One-open-shift partial index is missing';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_shift_tenant_fkey'
      and convalidated = true
  ) then
    raise exception 'Tenant-consistent order shift constraint is missing';
  end if;
end;
$constraint_checks$;

rollback;
