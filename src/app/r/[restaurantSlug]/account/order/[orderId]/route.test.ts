import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getRestaurantBySlug } from "@/lib/data";
import { resolveCustomerSession } from "@/lib/customer-auth/session";
import { setOrderPushAuthorization } from "@/lib/push-auth";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/data", () => ({ getRestaurantBySlug: vi.fn() }));
vi.mock("@/lib/customer-auth/session", () => ({ resolveCustomerSession: vi.fn() }));
vi.mock("@/lib/push-auth", () => ({ setOrderPushAuthorization: vi.fn() }));

import { GET } from "./route";

const restaurantId = "23000000-0000-0000-0000-000000000001";
const orderId = "43000000-0000-4000-8000-000000000001";
const phone = "971501234567";

function makeAdmin(row: unknown) {
  const eq = vi.fn().mockReturnThis();
  const query = {
    select: vi.fn().mockReturnThis(),
    eq,
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null })
  };
  return { admin: { from: vi.fn(() => query) }, eq };
}

function call(id = orderId, search = "") {
  const req = new NextRequest(`https://app.test/r/chaixpress/account/order/${id}${search}`);
  return GET(req, { params: Promise.resolve({ restaurantSlug: "chaixpress", orderId: id }) });
}

describe("account order route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRestaurantBySlug).mockResolvedValue({ id: restaurantId, slug: "chaixpress" } as never);
    vi.mocked(resolveCustomerSession).mockResolvedValue({
      status: "signed_in",
      identity: { restaurantId, phone, issuedAt: 1 }
    });
    vi.mocked(setOrderPushAuthorization).mockResolvedValue(true);
  });

  it("grants access to the customer's own order and redirects to tracking", async () => {
    const { admin, eq } = makeAdmin({ id: orderId });
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const response = await call(orderId, "?lang=ar");

    expect(eq).toHaveBeenCalledWith("restaurant_id", restaurantId);
    expect(eq).toHaveBeenCalledWith("id", orderId);
    expect(eq).toHaveBeenCalledWith("customer_phone", phone);
    expect(setOrderPushAuthorization).toHaveBeenCalledWith({ orderId, restaurantId });
    expect(response.headers.get("location")).toBe(
      `https://app.test/r/chaixpress/thank-you?order=${orderId}&lang=ar`
    );
  });

  it("refuses an order that is not the customer's", async () => {
    const { admin } = makeAdmin(null);
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const response = await call();

    expect(setOrderPushAuthorization).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://app.test/r/chaixpress/account");
  });

  it("refuses when signed out", async () => {
    vi.mocked(resolveCustomerSession).mockResolvedValue({ status: "signed_out" });
    const { admin } = makeAdmin({ id: orderId });
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const response = await call();

    expect(admin.from).not.toHaveBeenCalled();
    expect(setOrderPushAuthorization).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://app.test/r/chaixpress/account");
  });

  it("rejects malformed order ids before any lookup", async () => {
    const { admin } = makeAdmin({ id: orderId });
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const response = await call("not-a-uuid");

    expect(resolveCustomerSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://app.test/r/chaixpress/account");
  });
});
