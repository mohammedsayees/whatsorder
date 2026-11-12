import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
const { financeReadingState } = await import("./finance-document-data");

const NOW = Date.parse("2026-11-12T12:00:00Z");
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

describe("finance bill reading state", () => {
  afterEach(() => vi.restoreAllMocks());

  function state(uploadedMinutesAgo: number, job: { status?: string; locked_at?: string | null } | null) {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    return financeReadingState(ago(uploadedMinutesAgo), job);
  }

  it("treats a freshly uploaded or freshly claimed bill as still reading", () => {
    expect(state(1, { status: "queued" }).readingStalled).toBe(false);
    expect(state(30, { status: "running", locked_at: ago(9) })).toEqual({
      readingStartedAt: ago(9), readingStalled: false
    });
  });

  it("flags a read whose lease outlived the claim RPC's 10-minute expiry", () => {
    expect(state(30, { status: "running", locked_at: ago(11) }).readingStalled).toBe(true);
  });

  it("flags a bill whose post-upload read never claimed the job", () => {
    expect(state(3, { status: "queued" })).toEqual({ readingStartedAt: ago(3), readingStalled: true });
  });

  it("never flags finished or failed jobs", () => {
    expect(state(60, { status: "succeeded", locked_at: ago(59) }).readingStalled).toBe(false);
    expect(state(60, { status: "failed", locked_at: ago(59) }).readingStalled).toBe(false);
    expect(state(60, null).readingStalled).toBe(false);
  });
});
