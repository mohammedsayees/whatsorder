-- WhatsOrder restaurant-scoped new-order alerts
-- Run once after schema.sql, super_admin_migration.sql, and security_hardening_migration.sql.
-- The existing orders RLS policies remain the tenant-security boundary.

do $migration$
begin
  alter publication supabase_realtime add table public.orders;
exception
  when duplicate_object then
    null;
end;
$migration$;
