import { describe, expect, it, vi } from "vitest";

// The public catalog read always fails here: no Supabase client.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>) => fn,
  revalidateTag: vi.fn()
}));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => null, getSupabaseAdmin: () => null }));

const { getMenuOptionCatalog } = await import("./data");

describe("getMenuOptionCatalog when the catalog cannot be read", () => {
  it("degrades to no options for menu display", async () => {
    const catalog = await getMenuOptionCatalog("r1");
    expect(JSON.stringify(catalog)).not.toContain("error");
  });

  it("throws for order pricing (failClosed), so required options cannot be skipped", async () => {
    await expect(getMenuOptionCatalog("r1", { failClosed: true })).rejects.toThrow(/unavailable/);
  });
});
