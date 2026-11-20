import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";
import type { StaffOrderPayload } from "@/lib/staff-order-payload";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/super-admin-auth", () => ({ requireRestaurantAdmin: vi.fn() }));
vi.mock("@/lib/data", () => ({ getMenu: vi.fn(), getMenuOffers: vi.fn(), getMenuOptionCatalog: vi.fn() }));
vi.mock("@/lib/notification-jobs", () => ({ scheduleOrderNotifications: vi.fn() }));
vi.mock("@/lib/web-push", () => ({ sendOrderStatusPushNotification: vi.fn() }));

import { submitStaffOrderAction } from "./actions";

const rid = "23000000-0000-0000-0000-000000000001";
const oid = "43000000-0000-0000-0000-000000000001";
const savedOrder = { id: oid, customer_phone: "971501234567", notes: null };
const rewardedOrder = { ...savedOrder, notes: "Loyalty reward: free Crunch Burger", points_redeemed: 7 };

// The order already exists (a replay / lost response), so the action returns
// it without menu validation; the reward step then runs on that saved order.
function mockDb(rpcResult: { data: unknown; error: unknown }) {
  let orderReads = 0;
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => {
      orderReads += 1;
      return { data: orderReads === 1 ? savedOrder : rewardedOrder, error: null };
    })
  };
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn(() => query), rpc } as never);
  return { rpc, query };
}

function payload(redeemReward?: boolean) {
  return {
    restaurantId: rid,
    clientOrderId: oid,
    action: "paid_cash",
    items: [],
    redeemReward
  } as unknown as StaffOrderPayload;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRestaurantAdmin).mockResolvedValue({
    restaurantId: rid,
    userId: "actor",
    role: "staff",
    restaurant: { id: rid, country_code: "AE", phone_country_code: "971" }
  } as never);
});

describe("counter reward redemption", () => {
  it("redeems on the saved order and returns the order with the reward note", async () => {
    const { rpc } = mockDb({ data: { ok: true, already: false, reward: "Crunch Burger" }, error: null });

    const result = await submitStaffOrderAction(payload(true));

    expect(rpc).toHaveBeenCalledWith("redeem_loyalty_reward_for_order", {
      p_restaurant_id: rid,
      p_order_id: oid
    });
    expect(result.success).toBe("Order already synced. Reward redeemed: free Crunch Burger.");
    expect(result.order).toEqual(rewardedOrder);
  });

  it("does nothing extra when no reward was chosen", async () => {
    const { rpc } = mockDb({ data: null, error: null });

    const result = await submitStaffOrderAction(payload(false));

    expect(rpc).not.toHaveBeenCalled();
    expect(result).toEqual({ success: "Order already synced.", order: savedOrder });
  });

  it("keeps the order and says why when the card isn't full", async () => {
    mockDb({ data: { ok: false, reason: "not_enough_stamps", stamps: 5, required: 7 }, error: null });

    const result = await submitStaffOrderAction(payload(true));

    expect(result.error).toBeUndefined();
    expect(result.order).toEqual(savedOrder);
    expect(result.success).toBe("Order already synced. Reward NOT redeemed: the card isn't full.");
  });

  it("keeps the order when the redemption call fails", async () => {
    mockDb({ data: null, error: { code: "XX000" } });

    const result = await submitStaffOrderAction(payload(true));

    expect(result.order).toEqual(savedOrder);
    expect(result.success).toContain("Reward NOT redeemed");
  });

  it("never redeems for a payload from another restaurant", async () => {
    const { rpc } = mockDb({ data: { ok: true }, error: null });

    const result = await submitStaffOrderAction({ ...payload(true), restaurantId: "other" });

    expect(result.error).toContain("different restaurant");
    expect(rpc).not.toHaveBeenCalled();
  });
});
