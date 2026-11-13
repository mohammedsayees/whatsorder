import { describe, expect, it } from "vitest";
import { compareSnapshots, SNAPSHOT_SQL, takeSnapshot } from "./rehearsal-checks.mjs";

const base = () => ({
  rows: { "public.orders": 10, "public.restaurants": 2, "auth.users": 3, "storage.objects": 5 },
  storage_objects: { "menu-images": 4, "finance-documents": 1 },
  realtime: ["orders", "whatsapp_messages"],
  extensions: ["pgcrypto", "plpgsql"],
  policies: ["public.orders:Read orders"],
  rls_tables: ["orders", "restaurants"],
  functions: ["is_restaurant_member(uuid)"],
  sequences: { finance_report_runs_id_seq: 7 },
  table_grants: ["orders:authenticated:SELECT", "orders:service_role:INSERT", "orders:service_role:SELECT"],
  function_grants: ["is_restaurant_member(uuid):authenticated", "create_order_with_customer_v4(jsonb):service_role"],
  default_privileges: ["postgres:r:service_role:SELECT"],
  policy_definitions: { "public.orders:Read orders": "h-policy" },
  function_definitions: { "is_restaurant_member(uuid)": "h-fn" },
  triggers: { "public.orders:set_updated_at": "h-trg", "auth.users:on_auth_user_created": "h-auth" },
  indexes: { "orders:orders_pkey": "h-idx", "orders:idx_orders_restaurant": "h-idx2" },
  constraints: { "orders:orders_restaurant_id_fkey": "h-con" },
  role_settings: ["authenticated:statement_timeout=8s"],
  latest_writes: { orders: "2026-11-10T17:55:00.000+00:00", restaurants: "2026-11-01T09:00:00+00:00" },
  buckets: { "menu-images": "public=true | size_limit=2097152 | mime=image/webp", posters: "public=false | size_limit=none | mime=any" },
  old_links: 0
});

const statusOf = (results, prefix) => results.find((r) => r.check.startsWith(prefix)).status;

describe("rehearsal data checks", () => {
  it("passes identical snapshots in both modes", () => {
    for (const mode of ["rehearsal", "cutover"]) {
      expect(compareSnapshots(base(), base(), { mode }).every((r) => r.status === "PASS")).toBe(true);
    }
  });

  it("treats fewer rows in new as a warning in rehearsal but a failure at cutover", () => {
    const newer = base();
    newer.rows["public.orders"] = 8;
    expect(statusOf(compareSnapshots(base(), newer, { mode: "rehearsal" }), "Row counts")).toBe("WARN");
    expect(statusOf(compareSnapshots(base(), newer, { mode: "cutover" }), "Row counts")).toBe("FAIL");
  });

  it("fails more rows, missing tables and extra tables in either mode", () => {
    for (const change of [
      (s) => { s.rows["public.orders"] = 11; },
      (s) => { delete s.rows["auth.users"]; },
      (s) => { s.rows["public.new_table"] = 0; }
    ]) {
      const newer = base();
      change(newer);
      expect(statusOf(compareSnapshots(base(), newer, { mode: "rehearsal" }), "Row counts")).toBe("FAIL");
    }
  });

  it("fails schema drift, missing realtime tables and leftover Sydney links", () => {
    const newer = base();
    newer.policies = [];
    newer.rls_tables = ["restaurants"];
    newer.realtime = ["whatsapp_messages"];
    newer.extensions.push("pg_net");
    newer.old_links = 3;
    const results = compareSnapshots(base(), newer);
    expect(statusOf(results, "RLS policies")).toBe("FAIL");
    expect(statusOf(results, "RLS-enabled tables")).toBe("FAIL");
    expect(statusOf(results, "Realtime publication")).toBe("FAIL");
    expect(statusOf(results, "Live updates")).toBe("FAIL");
    expect(statusOf(results, "Extensions")).toBe("FAIL");
    expect(results.find((r) => r.check.startsWith("Old Sydney")).detail).toContain("3 row(s)");
  });

  it("fails any permission difference, in either direction", () => {
    const cases = [
      ["Table permissions", (s) => s.table_grants.push("orders:anon:SELECT")],
      ["Table permissions", (s) => { s.table_grants = s.table_grants.filter((g) => !g.includes("service_role:INSERT")); }],
      ["Function execute", (s) => s.function_grants.push("create_order_with_customer_v4(jsonb):anon")],
      ["Function execute", (s) => { s.function_grants = []; }],
      ["Default privileges", (s) => s.default_privileges.push("postgres:r:anon:SELECT")]
    ];
    for (const [check, change] of cases) {
      const newer = base();
      change(newer);
      const result = compareSnapshots(base(), newer, { mode: "rehearsal" }).find((r) => r.check.startsWith(check));
      expect(result.status, check).toBe("FAIL");
    }
    const exposed = base();
    exposed.table_grants.push("orders:anon:SELECT");
    const detail = compareSnapshots(base(), exposed).find((r) => r.check.startsWith("Table permissions")).detail;
    expect(detail).toContain("only in new: orders:anon:SELECT");
  });

  it("requires live updates for orders and chat even if both sides lack them", () => {
    const old = base();
    const newer = base();
    old.realtime = ["orders"];
    newer.realtime = ["orders"];
    expect(statusOf(compareSnapshots(old, newer), "Live updates")).toBe("FAIL");
  });

  it("shortens long difference lists", () => {
    const newer = base();
    newer.functions = Array.from({ length: 15 }, (_, i) => `extra_${i}()`);
    const detail = compareSnapshots(base(), newer).find((r) => r.check === "Public functions").detail;
    expect(detail).toContain("(+");
  });

  it("fails same-named objects whose definitions drifted", () => {
    const drift = [
      ["RLS policy definitions", (s) => { s.policy_definitions["public.orders:Read orders"] = "broader"; }],
      ["Function definitions", (s) => { s.function_definitions["is_restaurant_member(uuid)"] = "no-search-path"; }],
      ["Triggers", (s) => { delete s.triggers["auth.users:on_auth_user_created"]; }],
      ["Triggers", (s) => { s.triggers["public.orders:set_updated_at"] = "disabled"; }],
      ["Indexes", (s) => { delete s.indexes["orders:idx_orders_restaurant"]; }],
      ["Constraints", (s) => { s.constraints["orders:orders_restaurant_id_fkey"] = "not-validated"; }],
      ["API role settings", (s) => { s.role_settings = []; }],
      ["Storage bucket settings", (s) => { s.buckets.posters = "public=true | size_limit=none | mime=any"; }]
    ];
    for (const [check, mutate] of drift) {
      const newer = base();
      mutate(newer);
      const results = compareSnapshots(base(), newer, { mode: "rehearsal" });
      expect(statusOf(results, check)).toBe("FAIL");
      expect(results.filter((r) => r.status === "FAIL")).toHaveLength(1);
    }
  });

  it("names missing, changed and extra definitions", () => {
    const newer = base();
    newer.indexes["orders:orders_pkey"] = "changed";
    delete newer.indexes["orders:idx_orders_restaurant"];
    newer.indexes["orders:idx_new"] = "x";
    const { detail } = compareSnapshots(base(), newer).find((r) => r.check.startsWith("Indexes"));
    expect(detail).toBe("missing in new: orders:idx_orders_restaurant; different: orders:orders_pkey; only in new: orders:idx_new");
  });

  it("ignores the freeze on the old DB but fails if it reached the new one", () => {
    const frozenOld = base();
    frozenOld.triggers["public.orders:zz_cutover_freeze"] = "h-freeze";
    expect(compareSnapshots(frozenOld, base(), { mode: "cutover" }).every((r) => r.status === "PASS")).toBe(true);

    const restoredWhileFrozen = base();
    restoredWhileFrozen.triggers["public.orders:zz_cutover_freeze"] = "h-freeze";
    const results = compareSnapshots(frozenOld, restoredWhileFrozen, { mode: "cutover" });
    expect(statusOf(results, "Cutover freeze removed")).toBe("FAIL");
    expect(statusOf(results, "Triggers")).toBe("PASS");
  });

  it("post-move: fails on writes to the old DB after the switch, ignores row growth", () => {
    const sydney = base();
    const mumbai = base();
    mumbai.rows["public.orders"] = 500;
    const since = "2026-11-10T18:00:00Z";
    const clean = compareSnapshots(sydney, mumbai, { mode: "post-move", since });
    expect(clean.every((r) => r.status === "PASS")).toBe(true);
    expect(clean.some((r) => r.check.startsWith("Row counts"))).toBe(false);

    sydney.latest_writes.orders = "2026-11-11T08:30:00.000+00:00";
    sydney.latest_writes.whatsapp_messages = "2026-11-12T10:00:00.000+00:00";
    const late = compareSnapshots(sydney, mumbai, { mode: "post-move", since });
    expect(late[0]).toMatchObject({ check: "Writes to the old DB after the move", status: "FAIL" });
    expect(late[0].detail).toContain("2 table(s)");
    expect(late[0].detail.indexOf("whatsapp_messages")).toBeLessThan(late[0].detail.indexOf("orders"));
  });

  it("post-move: schema drift is a warning, but leftover Sydney links still fail", () => {
    const mumbai = base();
    mumbai.functions.push("new_rpc_after_move()");
    mumbai.old_links = 3;
    const results = compareSnapshots(base(), mumbai, { mode: "post-move", since: "2026-11-10T18:00:00Z" });
    expect(statusOf(results, "Public functions")).toBe("WARN");
    expect(statusOf(results, "Old Sydney storage links")).toBe("FAIL");
  });

  it("post-move needs a switch time", () => {
    expect(() => compareSnapshots(base(), base(), { mode: "post-move" })).toThrow(/--since/);
  });

  it("snapshots read-only through psql with the old storage prefix", () => {
    const calls = [];
    const fakeRun = (cmd, args, options) => {
      calls.push({ cmd, args, options });
      return `${JSON.stringify(base())}\n`;
    };
    expect(takeSnapshot("postgresql://db", "aaaaaaaaaaaaaaaaaaaa", fakeRun)).toEqual(base());
    const { cmd, args, options } = calls[0];
    expect(cmd).toBe("psql");
    expect(args).toContain("set default_transaction_read_only = on;");
    expect(args).toContain("old_prefix=https://aaaaaaaaaaaaaaaaaaaa.supabase.co/storage/v1/");
    expect(options.input).toBe(SNAPSHOT_SQL);
    expect(SNAPSHOT_SQL).not.toMatch(/\b(insert|update|delete|truncate|alter|drop)\b/i);
  });
});
