import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/super-admin-auth", () => ({ requireRestaurantAdmin: vi.fn() }));
vi.mock("@/lib/data", () => ({ getMenu: vi.fn(), getMenuOffers: vi.fn(), getMenuOptionCatalog: vi.fn() }));
vi.mock("@/lib/notification-jobs", () => ({ scheduleOrderNotifications: vi.fn() }));
vi.mock("@/lib/web-push", () => ({ sendOrderStatusPushNotification: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { lookupStampCustomerAction } from "./actions";

const rid = "23000000-0000-0000-0000-000000000001";

function mockDb(customer: unknown, settings: unknown = {
  loyalty_enabled: true,
  loyalty_stamps_required: 7,
  loyalty_reward_description: "Crunch Burger"
}) {
  const calls: Array<[string, string, unknown]> = [];
  const from = vi.fn((table: string) => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((column: string, value: unknown) => {
        calls.push([table, column, value]);
        return builder;
      }),
      maybeSingle: vi.fn().mockResolvedValue({
        data: table === "restaurants" ? settings : customer,
        error: null
      })
    };
    return builder;
  });
  vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);
  return { from, calls };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRestaurantAdmin).mockResolvedValue({
    restaurantId: rid,
    role: "staff",
    restaurant: { id: rid, phone_country_code: "971" }
  } as never);
});

describe("lookupStampCustomerAction", () => {
  it("normalizes a local number and looks it up only in the session's restaurant", async () => {
    const { calls } = mockDb({ name: "Sara Ali", loyalty_points_balance: 4 });
    const result = await lookupStampCustomerAction("050 123 4567");
    expect(result).toEqual({ status: "known", name: "Sara", stamps: 4, required: 7, reward: "Crunch Burger" });
    expect(calls).toContainEqual(["customers", "restaurant_id", rid]);
    expect(calls).toContainEqual(["customers", "phone", "971501234567"]);
    expect(calls).toContainEqual(["restaurants", "id", rid]);
  });

  it("reports a new customer", async () => {
    mockDb(null);
    expect(await lookupStampCustomerAction("0501234567")).toEqual({
      status: "new",
      required: 7,
      reward: "Crunch Burger"
    });
  });

  it("never searches an incomplete number", async () => {
    const { from } = mockDb(null);
    expect(await lookupStampCustomerAction("0501")).toBeNull();
    expect(await lookupStampCustomerAction("05012345")).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("reports when loyalty is off", async () => {
    mockDb(null, { loyalty_enabled: false, loyalty_stamps_required: 7, loyalty_reward_description: null });
    expect(await lookupStampCustomerAction("0501234567")).toEqual({ status: "off" });
  });

  it("requires a restaurant session", async () => {
    vi.mocked(requireRestaurantAdmin).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(lookupStampCustomerAction("0501234567")).rejects.toThrow();
  });
});
