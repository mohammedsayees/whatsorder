import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadOrderConfirmation } from "@/lib/order-confirmation";
import { getOrderPushAuthorization } from "@/lib/push-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

vi.mock("@/lib/push-auth", () => ({ getOrderPushAuthorization: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
const orderId = "43000000-0000-0000-0000-000000000001";

describe("saved order confirmation", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([null, { restaurantId: "other", orderId },
    { restaurantId: "restaurant", orderId: "other" }])(
    "does not query private orders without the matching proof: %j", async (proof) => {
      vi.mocked(getOrderPushAuthorization).mockResolvedValue(proof);
      expect(await loadOrderConfirmation("restaurant", orderId)).toBeNull();
      expect(getSupabaseAdmin).not.toHaveBeenCalled();
    });

  it("rejects malformed references before checking authorization", async () => {
    expect(await loadOrderConfirmation("restaurant", "invalid")).toBeNull();
    expect(getOrderPushAuthorization).not.toHaveBeenCalled();
  });

  it("loads the persisted message using both order and restaurant filters", async () => {
    const saved = { id: orderId, whatsapp_message: "original order" };
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: saved, error: null }) };
    vi.mocked(getOrderPushAuthorization).mockResolvedValue({ restaurantId: "restaurant", orderId });
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn(() => query) } as never);
    expect(await loadOrderConfirmation("restaurant", orderId)).toEqual(saved);
    expect(query.eq.mock.calls).toEqual([["restaurant_id", "restaurant"], ["id", orderId]]);
    query.maybeSingle.mockResolvedValue({ data: null, error: { message: "offline" } } as never);
    await expect(loadOrderConfirmation("restaurant", orderId)).rejects.toThrow("Please retry");
  });
});
