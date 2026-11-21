import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261212090000_owner_whatsapp_login.sql"),
  "utf8"
).toLowerCase();

describe("owner WhatsApp login migration", () => {
  it("keeps every member reachable by email or phone", () => {
    expect(sql).toContain("alter column email drop not null");
    expect(sql).toContain("check (email is not null or phone_e164 is not null)");
    expect(sql).toContain("on public.restaurant_users (restaurant_id, phone_e164)");
  });

  it("adds no anon/authenticated write policies", () => {
    expect(sql).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/);
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*to (anon|authenticated)/);
  });

  it("keeps the login request table service-role only", () => {
    expect(sql).toContain("revoke all on table public.owner_login_requests from anon, authenticated");
    expect(sql).not.toMatch(/create policy[^;]*on public\.owner_login_requests/);
  });

  it("never stores the login code", () => {
    expect(sql).not.toMatch(/\b(otp|code_hash|token)\s+text/);
  });

  it("restricts the request functions to the service role", () => {
    for (const fn of [
      "reserve_owner_login_request",
      "claim_owner_login_request_for_send",
      "consume_owner_login_link"
    ]) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\)\\s*from public, anon, authenticated`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\)\\s*to service_role`));
    }
  });

  it("only claims fresh, unsent requests and consumes a link once", () => {
    expect(sql).toContain("r.sent_at is null");
    expect(sql).toContain("for update skip locked");
    expect(sql).toMatch(/set used_at = now\(\)[\s\S]*r\.used_at is null[\s\S]*r\.expires_at > now\(\)/);
  });
});

const step2 = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261213090000_owner_whatsapp_code_login.sql"),
  "utf8"
).toLowerCase();

describe("owner WhatsApp code login migration", () => {
  it("adds no policies or anon/authenticated grants", () => {
    expect(step2).not.toContain("create policy");
    expect(step2).not.toMatch(/grant [^;]*to (anon|authenticated)/);
    expect(step2).toContain("revoke all on table public.owner_login_ip_attempts from anon, authenticated");
  });

  it("restricts every new function to the service role", () => {
    for (const fn of ["check_owner_login_ip_rate_limit", "start_owner_code_verification", "finish_owner_code_login"]) {
      expect(step2).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\)\\s*from public, anon, authenticated`));
      expect(step2).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\)\\s*to service_role`));
    }
  });

  it("counts an attempt before verification and stops at the cap", () => {
    expect(step2).toContain("r.attempts < max_attempts");
    expect(step2).toContain("set attempts = r.attempts + 1");
    expect(step2).toContain("r.kind = 'code'");
  });

  it("stores only hashed IPs", () => {
    expect(step2).toContain("ip_hash    text not null");
    expect(step2).not.toMatch(/\bip\s+(inet|text)/);
  });
});
