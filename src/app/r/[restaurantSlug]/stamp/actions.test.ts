import { beforeEach, describe, expect, it, vi } from "vitest";

import { getRestaurantBySlug } from "@/lib/data";
import { resolveCustomerSession } from "@/lib/customer-auth/session";
import { verifyStampClaimToken } from "@/lib/customer-auth/stamp-claim";
import { getSupabaseAdmin } from "@/lib/supabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/data", () => ({ getRestaurantBySlug: vi.fn() }));
vi.mock("@/lib/customer-auth/session", () => ({ resolveCustomerSession: vi.fn() }));
vi.mock("@/lib/customer-auth/stamp-claim", () => ({ verifyStampClaimToken: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));

import { claimStampAction } from "./actions";

const rid = "23000000-0000-0000-0000-000000000001";
const oid = "43000000-0000-4000-8000-000000000001";
const phone = "971501234567";

function mockRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  vi.mocked(getSupabaseAdmin).mockReturnValue({ rpc } as never);
  return rpc;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getRestaurantBySlug).mockResolvedValue({ id: rid, slug: "chaixpress" } as never);
  vi.mocked(verifyStampClaimToken).mockResolvedValue({ restaurantId: rid, orderId: oid });
  vi.mocked(resolveCustomerSession).mockResolvedValue({
    status: "signed_in",
    identity: { restaurantId: rid, phone, issuedAt: 1 }
  });
});

describe("claimStampAction", () => {
  it("claims the token's order with the session's verified phone", async () => {
    const rpc = mockRpc({
      data: { ok: true, already: false, stamped: true, stamps: 4, required: 7, reward: "Crunch Burger" },
      error: null
    });

    const result = await claimStampAction("chaixpress", "tok");

    expect(rpc).toHaveBeenCalledWith("claim_order_stamp", { p_restaurant_id: rid, p_order_id: oid, p_phone: phone });
    expect(result).toEqual({ ok: true, outcome: "stamped", stamps: 4, required: 7, reward: "Crunch Burger" });
  });

  it("rejects a token for another café before touching the database", async () => {
    vi.mocked(verifyStampClaimToken).mockResolvedValue({ restaurantId: "other", orderId: oid });
    const rpc = mockRpc({ data: null, error: null });
    expect(await claimStampAction("chaixpress", "tok")).toEqual({ ok: false, error: "invalid_link" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid tokens and signed-out customers", async () => {
    const rpc = mockRpc({ data: null, error: null });
    vi.mocked(verifyStampClaimToken).mockResolvedValueOnce(null);
    expect(await claimStampAction("chaixpress", "bad")).toEqual({ ok: false, error: "invalid_link" });
    vi.mocked(resolveCustomerSession).mockResolvedValueOnce({ status: "signed_out" });
    expect(await claimStampAction("chaixpress", "tok")).toEqual({ ok: false, error: "signed_out" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps database refusals", async () => {
    mockRpc({ data: { ok: false, reason: "already_claimed" }, error: null });
    expect(await claimStampAction("chaixpress", "tok")).toEqual({ ok: false, error: "already_claimed" });
    mockRpc({ data: { ok: false, reason: "order_not_found" }, error: null });
    expect(await claimStampAction("chaixpress", "tok")).toEqual({ ok: false, error: "invalid_link" });
    mockRpc({ data: null, error: { code: "XX000" } });
    expect(await claimStampAction("chaixpress", "tok")).toEqual({ ok: false, error: "failed" });
  });

  it("reports kitchen orders as pending", async () => {
    mockRpc({ data: { ok: true, stamped: false, pending: true, stamps: 3, required: 7, reward: null }, error: null });
    expect(await claimStampAction("chaixpress", "tok")).toMatchObject({ ok: true, outcome: "pending" });
  });
});
