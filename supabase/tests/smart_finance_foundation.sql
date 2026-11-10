\set ON_ERROR_STOP on

-- Rollback-only Smart Finance tenant/RLS integration checks.
begin;

insert into auth.users (id, email, role, aud, created_at, updated_at)
values
  ('1f000000-0000-0000-0000-000000000001', 'finance-manager@test.invalid', 'authenticated', 'authenticated', now(), now()),
  ('1f000000-0000-0000-0000-000000000002', 'finance-staff@test.invalid', 'authenticated', 'authenticated', now(), now()),
  ('1f000000-0000-0000-0000-000000000003', 'finance-owner@test.invalid', 'authenticated', 'authenticated', now(), now()),
  ('1f000000-0000-0000-0000-000000000004', 'finance-super@test.invalid', 'authenticated', 'authenticated', now(), now());

insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active, finance_enabled)
values
  ('2f000000-0000-0000-0000-000000000001', 'Finance A', 'finance-a', '971500000081', 'live', true, true),
  ('2f000000-0000-0000-0000-000000000002', 'Finance B', 'finance-b', '971500000082', 'live', true, true);

insert into public.restaurant_users (restaurant_id, user_id, email, role, accepted_at)
values
  ('2f000000-0000-0000-0000-000000000001', '1f000000-0000-0000-0000-000000000001', 'finance-manager@test.invalid', 'manager', now()),
  ('2f000000-0000-0000-0000-000000000001', '1f000000-0000-0000-0000-000000000002', 'finance-staff@test.invalid', 'staff', now()),
  ('2f000000-0000-0000-0000-000000000001', '1f000000-0000-0000-0000-000000000003', 'finance-owner@test.invalid', 'owner', now());

update public.profiles set role = 'super_admin'
where id = '1f000000-0000-0000-0000-000000000004';

set local role service_role;
insert into public.finance_categories (
  id, restaurant_id, name, classification, created_by, updated_by
) values
  ('3f000000-0000-0000-0000-000000000001', '2f000000-0000-0000-0000-000000000001', 'Finance A custom', 'operating', '1f000000-0000-0000-0000-000000000003', '1f000000-0000-0000-0000-000000000003'),
  ('3f000000-0000-0000-0000-000000000002', '2f000000-0000-0000-0000-000000000002', 'Finance B custom', 'operating', null, null);
insert into public.finance_expenses (
  id, restaurant_id, category_id, description, incurred_on,
  subtotal_fils, input_vat_fils, total_fils, status,
  approved_by, approved_at, created_by, updated_by
) values
  ('4f000000-0000-0000-0000-000000000001', '2f000000-0000-0000-0000-000000000001', '3f000000-0000-0000-0000-000000000001', 'Tenant A rent', current_date, 100000, 0, 100000, 'approved', '1f000000-0000-0000-0000-000000000003', now(), '1f000000-0000-0000-0000-000000000003', '1f000000-0000-0000-0000-000000000003'),
  ('4f000000-0000-0000-0000-000000000002', '2f000000-0000-0000-0000-000000000002', '3f000000-0000-0000-0000-000000000002', 'Tenant B rent', current_date, 200000, 0, 200000, 'draft', null, null, null, null);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '1f000000-0000-0000-0000-000000000001', true);
do $manager_checks$
begin
  if (select count(*) from public.finance_expenses) <> 1 then
    raise exception 'Manager must read exactly its own tenant finance row';
  end if;
  begin
    insert into public.finance_expenses (
      restaurant_id, category_id, description, incurred_on,
      subtotal_fils, input_vat_fils, total_fils
    ) values (
      '2f000000-0000-0000-0000-000000000001',
      '3f000000-0000-0000-0000-000000000001', 'Unauthorized', current_date,
      100, 0, 100
    );
    raise exception 'Authenticated finance insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$manager_checks$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '1f000000-0000-0000-0000-000000000002', true);
do $staff_denied$
begin
  if (select count(*) from public.finance_expenses) <> 0 then
    raise exception 'Staff saw finance rows without explicit access';
  end if;
end;
$staff_denied$;

reset role;
set local role service_role;
insert into public.finance_role_permissions (restaurant_id, role, can_view, updated_by)
values ('2f000000-0000-0000-0000-000000000001', 'staff', true, '1f000000-0000-0000-0000-000000000003')
on conflict (restaurant_id, role) do update
set can_view = excluded.can_view, updated_by = excluded.updated_by;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '1f000000-0000-0000-0000-000000000002', true);
do $staff_allowed$
begin
  if (select count(*) from public.finance_expenses) <> 1 then
    raise exception 'Explicitly permitted staff did not receive tenant finance read access';
  end if;
end;
$staff_allowed$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '1f000000-0000-0000-0000-000000000004', true);
do $super_admin_denied$
begin
  if (select count(*) from public.finance_expenses) <> 0 then
    raise exception 'Super admin received implicit finance visibility';
  end if;
end;
$super_admin_denied$;

reset role;
set local role service_role;
do $integrity_checks$
begin
  begin
    insert into public.finance_expenses (
      restaurant_id, category_id, description, incurred_on,
      subtotal_fils, input_vat_fils, total_fils
    ) values (
      '2f000000-0000-0000-0000-000000000001',
      '3f000000-0000-0000-0000-000000000002', 'Cross tenant', current_date,
      100, 0, 100
    );
    raise exception 'Cross-tenant finance category reference unexpectedly succeeded';
  exception when foreign_key_violation then null;
  end;
  if not exists (
    select 1 from public.finance_audit_events
    where restaurant_id = '2f000000-0000-0000-0000-000000000001'
      and entity_type = 'expense'
      and entity_id = '4f000000-0000-0000-0000-000000000001'
      and action = 'insert'
  ) then
    raise exception 'Finance expense audit event was not captured atomically';
  end if;
end;
$integrity_checks$;

update public.restaurants set finance_enabled = false
where id = '2f000000-0000-0000-0000-000000000001';
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '1f000000-0000-0000-0000-000000000001', true);
do $feature_flag_check$
begin
  if (select count(*) from public.finance_expenses) <> 0 then
    raise exception 'Disabled tenant flag did not close finance reads';
  end if;
end;
$feature_flag_check$;

rollback;
