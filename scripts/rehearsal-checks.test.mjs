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
