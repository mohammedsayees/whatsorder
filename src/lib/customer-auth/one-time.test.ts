import { beforeEach, describe, expect, it, vi } from "vitest";

const inserted: Array<Record<string, unknown>> = [];
let insertError: { code: string } | null = null;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        if (insertError) return { error: insertError };
        if (inserted.some((r) => r.jti === row.jti)) return { error: { code: "23505" } };
        inserted.push(row);
        return { error: null };
      },
      delete: () => ({ lt: async () => ({ error: null }) })
    })
  })
}));

const { consumeLinkToken, isSessionRevoked } = await import("./one-time");

beforeEach(() => {
  inserted.length = 0;
  insertError = null;
});

describe("consumeLinkToken", () => {
  it("accepts a link once and refuses it after that", async () => {
    expect(await consumeLinkToken("11111111-1111-4111-8111-111111111111", "r1")).toBe(true);
    expect(await consumeLinkToken("11111111-1111-4111-8111-111111111111", "r1")).toBe(false);
  });

  it("fails closed when the use cannot be recorded", async () => {
    insertError = { code: "08006" };
    expect(await consumeLinkToken("22222222-2222-4222-8222-222222222222", "r1")).toBe(false);
  });

  it("accepts tokens minted before jti existed (they expire within 10 minutes)", async () => {
    expect(await consumeLinkToken(null, "r1")).toBe(true);
  });
});

describe("isSessionRevoked", () => {
  const revokedAt = "2026-11-13T10:00:00.000Z";
  const seconds = (iso: string) => Date.parse(iso) / 1000;

  it("revokes sessions issued at or before the sign-out", () => {
    expect(isSessionRevoked(seconds("2026-11-01T00:00:00Z"), revokedAt)).toBe(true);
    expect(isSessionRevoked(seconds(revokedAt), revokedAt)).toBe(true);
  });

  it("keeps sessions issued after the sign-out, and when there is none", () => {
    expect(isSessionRevoked(seconds("2026-11-13T10:00:01Z"), revokedAt)).toBe(false);
    expect(isSessionRevoked(seconds("2026-11-01T00:00:00Z"), null)).toBe(false);
  });

  it("treats a session with no issue time as revoked once a sign-out exists", () => {
    expect(isSessionRevoked(null, revokedAt)).toBe(true);
  });
});
