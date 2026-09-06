import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitStaffOrderAction, addItemsToOrderAction, collectPaymentAndCompleteAction, changeOrderPaymentMethodAction } from "./actions";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";
import { getMenu } from "@/lib/data";
import { scheduleOrderNotifications } from "@/lib/notification-jobs";
import type { StaffOrderPayload } from "@/lib/staff-order-payload";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/super-admin-auth", () => ({ requireRestaurantAdmin: vi.fn() }));
vi.mock("@/lib/data", () => ({ getMenu: vi.fn(), getMenuOffers: vi.fn(), getMenuOptionCatalog: vi.fn() }));
vi.mock("@/lib/notification-jobs", () => ({ scheduleOrderNotifications: vi.fn() }));
vi.mock("@/lib/web-push", () => ({ sendOrderStatusPushNotification: vi.fn() }));
const rid = "23000000-0000-0000-0000-000000000001";
const oid = "43000000-0000-0000-0000-000000000001";
const payload = { restaurantId: rid, clientOrderId: oid, items: [] } as unknown as StaffOrderPayload;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRestaurantAdmin).mockResolvedValue({
    restaurantId: rid, userId: "actor", role: "staff", restaurant: { id: rid, country_code: "AE" }
  } as never);
});

describe("offline order replay", () => {
  it("recovers an add-on before checking a changed menu", async () => {
    const addition = { parent_order_id: oid, resulting_order_id: oid, mode: "amended", added_items: [{ name: "Old tea", price: 5, quantity: 1 }], added_subtotal: 5 };
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: addition, error: null }),
      single: vi.fn().mockResolvedValue({ data: { id: oid }, error: null }) };
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn(() => query) } as never);
    const result = await addItemsToOrderAction(oid, { clientOrderId: oid, items: [] });
    expect(result.success).toBe("Items already added.");
    expect(result.order?.items).toEqual(addition.added_items);
    expect(getMenu).not.toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith("restaurant_id", rid);
  });
  it("returns the saved order after a lost response even when the menu is unavailable", async () => {
    const order = { id: oid, items: [{ name: "Discontinued tea" }] };
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: order, error: null }) };
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn(() => query) } as never);
    vi.mocked(getMenu).mockRejectedValue(new Error("menu unavailable"));
    expect(await submitStaffOrderAction(payload)).toEqual({ success: "Order already synced.", order });
    expect(getMenu).not.toHaveBeenCalled();
    expect(query.eq.mock.calls).toEqual([["restaurant_id", rid], ["client_order_id", oid]]);
  });

  it("rejects a different tenant before looking up the replay", async () => {
    const from = vi.fn();
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);
    expect((await submitStaffOrderAction({ ...payload, restaurantId: "other" })).error).toContain("different restaurant");
    expect(from).not.toHaveBeenCalled();
  });

  it("does not attempt a new insert when replay lookup fails", async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "offline" } }) };
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn(() => query) } as never);
    expect((await submitStaffOrderAction(payload)).error).toContain("could not be checked");
    expect(getMenu).not.toHaveBeenCalled();
  });
});

describe("transactional payment actions", () => {
  function setup(data: unknown, error: unknown = null) {
    const rpc = vi.fn().mockResolvedValue({ data, error });
    const from = vi.fn(() => { throw new Error("Unexpected nontransactional write"); });
    vi.mocked(getSupabaseAdmin).mockReturnValue({ rpc, from } as never);
    const form = new FormData();
    form.set("order_id", oid);
    form.set("payment_method", "Cash on Delivery");
    return { rpc, from, form };
  }

  it("collects and completes with one RPC", async () => {
    const { rpc, from, form } = setup({ order_id: oid, changed: true });
    await collectPaymentAndCompleteAction(form);
    expect(rpc).toHaveBeenCalledWith("record_order_payment_async", {
      target_restaurant_id: rid, target_order_id: oid, requested_payment_method: "Cash on Delivery",
      complete_order: true, event_actor_user_id: "actor"
    });
    expect(from).not.toHaveBeenCalled();
    expect(scheduleOrderNotifications).toHaveBeenCalledOnce();
  });

  it("does not send another notification for a completed retry", async () => {
    const { form } = setup({ order_id: oid, changed: false });
    await collectPaymentAndCompleteAction(form);
    expect(scheduleOrderNotifications).not.toHaveBeenCalled();
  });

  it("does not notify when the payment transaction fails", async () => {
    const { form } = setup(null, { message: "audit insert failed" });
    await expect(collectPaymentAndCompleteAction(form)).rejects.toThrow("could not be saved");
    expect(scheduleOrderNotifications).not.toHaveBeenCalled();
  });

  it("delegates corrections and audit to the transaction", async () => {
    const { rpc, from, form } = setup({ order_id: oid, changed: true });
    expect((await changeOrderPaymentMethodAction({}, form)).success).toContain("Cash");
    expect(rpc.mock.calls[0][1].complete_order).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});
