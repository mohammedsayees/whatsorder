// Isolated test DB only: DATABASE_URL must point at an empty disposable database.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
const url = process.env.DATABASE_URL;
if (!url || process.env.ALLOW_TEST_DATABASE_RESET !== "true") throw new Error("Set DATABASE_URL and ALLOW_TEST_DATABASE_RESET=true for a disposable database");
const run = (...args) => execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", ...args], { stdio: "inherit" });
run("-f", "scripts/test-db-bootstrap.sql");
const legacy = ['schema.sql', 'customer_profile_loyalty_migration.sql',
 'super_admin_migration.sql', 'security_hardening_migration.sql', 'fulfilment_options_migration.sql',
 'arabic_menu_fields_migration.sql', 'customer_feedback_migration.sql', 'dine_in_migration.sql',
 'new_order_realtime_migration.sql', 'menu_offers_migration.sql', 'pilot_launch_hardening_migration.sql',
 '20260620_lock_down_public_order_creation.sql', '20260620_p1_pilot_operations.sql'];
for (const file of [...legacy, ...readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort().map(f => "migrations/" + f)]) run("-f", "supabase/" + file);
for (const file of readdirSync("supabase/tests").filter(f => f.endsWith(".sql")).sort()) {
  if (file === "jobs_phase1.sql") {
    // pg_prove, unlike psql, fails the process on a failed TAP assertion.
    execFileSync("pg_prove", ["--dbname", url, "supabase/tests/" + file], { stdio: "inherit" });
  } else run("-f", "supabase/tests/" + file);
}
