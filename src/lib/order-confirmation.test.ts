import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadOrderConfirmation } from "@/lib/order-confirmation";
import { getOrderPushAuthorization } from "@/lib/push-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

vi.mock("@/lib/push-auth", () => ({ getOrderPushAuthorization: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/rider-location-data", () => ({ getCustomerRiderView: vi.fn(async () => null) }));
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

  it("loads the order and its status history, both scoped to order and restaurant", async () => {
    const saved = { id: orderId, whatsapp_message: "original order", status: "Accepted",
      created_at: "2026-11-17T10:00:00Z", fulfilment_type: "delivery" };
    const events = [{ to_status: "Accepted", created_at: "2026-11-17T10:02:00Z" }];
    const orderQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: saved, error: null }) };
    const eventsQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: events, error: null }) };
    const from = vi.fn((table: string) => table === "orders" ? orderQuery : eventsQuery);
    vi.mocked(getOrderPushAuthorization).mockResolvedValue({ restaurantId: "restaurant", orderId });
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);

    expect(await loadOrderConfirmation("restaurant", orderId)).toEqual({
      ...saved, status_events: events, customer_arrived_at: null, customer_arrival_note: null, rider: null, online_payment_status: null,
      receipt: null });
    // Main read and the separate arrival and payment reads are all order- and tenant-scoped.
    expect(orderQuery.eq.mock.calls).toEqual([
      ["restaurant_id", "restaurant"], ["id", orderId],
      ["restaurant_id", "restaurant"], ["id", orderId],
      ["restaurant_id", "restaurant"], ["id", orderId]]);
    expect(eventsQuery.eq.mock.calls).toEqual([["restaurant_id", "restaurant"], ["order_id", orderId]]);
    expect(eventsQuery.select).toHaveBeenCalledWith("to_status,created_at");

    eventsQuery.limit.mockResolvedValue({ data: null, error: { message: "offline" } } as never);
    expect((await loadOrderConfirmation("restaurant", orderId))?.status_events).toEqual([]);

    orderQuery.maybeSingle.mockResolvedValue({ data: null, error: { message: "offline" } } as never);
    await expect(loadOrderConfirmation("restaurant", orderId)).rejects.toThrow("Please retry");
  });

  it("reads the receipt only when asked, scoped to order and restaurant", async () => {
    const receipt = { subtotal: 29, delivery_fee: 0, discount_amount: 2.9, loyalty_discount: 0, promo_code: "SAVE10",
      payment_method: "Cash on Delivery", delivery_address: "Building 12", table_number: null, car_plate_number: null };
    const saved = { id: orderId, whatsapp_message: "m", status: "New", created_at: null, fulfilment_type: "delivery" };
    const orderQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => {
        const columns = String(orderQuery.select.mock.calls.at(-1)?.[0] ?? "");
        return { data: columns.startsWith("subtotal") ? receipt : saved, error: null };
      }) };
    const eventsQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [], error: null }) };
    const from = vi.fn((table: string) => table === "orders" ? orderQuery : eventsQuery);
    vi.mocked(getOrderPushAuthorization).mockResolvedValue({ restaurantId: "restaurant", orderId });
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);

    expect((await loadOrderConfirmation("restaurant", orderId))?.receipt).toBeNull();
    expect(orderQuery.select.mock.calls.some(([columns]) => String(columns).startsWith("subtotal"))).toBe(false);

    orderQuery.select.mockClear();
    orderQuery.eq.mockClear();
    const loaded = await loadOrderConfirmation("restaurant", orderId, { receipt: true });
    expect(loaded?.receipt).toEqual(receipt);
    expect(orderQuery.eq.mock.calls).toHaveLength(8);
    expect(orderQuery.eq.mock.calls.filter(([column]) => column === "restaurant_id")).toHaveLength(4);
  });
});
