import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("instant owner access contracts", () => {
  const instant = read("src/lib/instant-owner-access.ts");
  const claim = read("src/app/try/claim/actions.ts");
  const verify = read("src/app/auth/verify-email/actions.ts");
  const layout = read("src/app/admin/layout.tsx");
  const migration = read("supabase/migrations/20261112140000_owner_email_verification.sql");

  it("only signs in brand-new accounts, via an invite link that is never emailed", () => {
    expect(instant).toContain('generateLink({\n    type: "invite"');
    expect(instant).not.toMatch(/type:\s*"magiclink"/);
    expect(instant).toContain("session.user.id !== link.user.id");
  });

  it("creates sessions on an ephemeral client, never the shared anon client", () => {
    for (const source of [instant, verify]) {
      expect(source).toContain("createEphemeralAuthClient()");
      expect(source).not.toContain("getSupabase()");
    }
  });

  it("only links an unlinked owner membership of the claimed restaurant", () => {
    expect(instant).toContain('.eq("restaurant_id", restaurantId)');
    expect(instant).toContain('.is("user_id", null)');
    expect(instant).toContain('.eq("role", "restaurant_admin")');
  });

  it("runs only after a successful claim and falls back to the emailed invite", () => {
    const rpcAt = claim.indexOf('admin.rpc("claim_demo_restaurant"');
    const instantAt = claim.indexOf("startInstantOwnerSession(");
    const inviteAt = claim.indexOf("inviteRestaurantUser(\n");
    expect(rpcAt).toBeGreaterThan(-1);
    expect(instantAt).toBeGreaterThan(rpcAt);
    expect(inviteAt).toBeGreaterThan(instantAt);
    expect(claim).toContain("sendOwnerVerificationEmail(email)");
  });

  it("starts a verification deadline and enforces it in the dashboard", () => {
    expect(instant).toContain("owner_email_verification_due_at: ownerEmailVerificationDueAt(now)");
    expect(layout).toContain('redirect("/auth/confirm-email-required")');
    expect(migration).toContain("add column if not exists owner_email_verified_at timestamptz");
    expect(migration).toContain("add column if not exists owner_email_verification_due_at timestamptz");
  });

  it("verifies only restaurants the user owns, under that same email", () => {
    expect(verify).toContain('.in("role", ["owner", "restaurant_admin"])');
    expect(verify).toContain('.eq("owner_email", email)');
    expect(verify).toContain("admin.auth.getUser(accessToken)");
  });
});
