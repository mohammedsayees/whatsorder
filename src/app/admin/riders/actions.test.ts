import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";
import { sendRiderWhatsApp } from "@/lib/rider-whatsapp";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/super-admin-auth", () => ({
  requireRestaurantAdmin: vi.fn(),
  requireRestaurantRole: vi.fn()
}));
vi.mock("@/lib/rider-whatsapp", () => ({ sendRiderWhatsApp: vi.fn() }));

import { assignRiderToOrderAction } from "./actions";

const restaurantId = "23000000-0000-0000-0000-000000000001";
const orderId = "43000000-0000-0000-0000-000000000001";
const riderId = "53000000-0000-4000-8000-000000000001";

const order = {
  id: orderId,
  restaurant_id: restaurantId,
  fulfilment_type: "delivery",
  status: "Preparing",
  customer_name: "Customer",
  customer_phone: "971501234567",
  delivery_area: "Area",
  delivery_address: "Address",
  delivery_landmark: null,
  delivery_google_maps_url: null,
  payment_method: "Cash on Delivery",
  total: 20
};
const rider = {
  id: riderId,
  restaurant_id: restaurantId,
  name: "Ahmed",
  phone: "971509876543",
  is_active: true,
  created_at: "2026-11-10T00:00:00.000Z"
};

function queryResult(data: unknown) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null })
  };
  return builder;
}

function makeAdmin(orderData: unknown = order, riderData: unknown = rider) {
  const orderQuery = queryResult(orderData);
  const riderQuery = queryResult(riderData);
  const updateBuilder = {
    eq: vi.fn().mockReturnThis(),
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve({ error: null }).then(resolve);
    }
  };
  const assignmentTable = {
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { id: "assignment-1" }, error: null })
      }))
    })),
    update: vi.fn(() => updateBuilder)
  };
  const from = vi.fn((table: string) => {
    if (table === "orders") return orderQuery;
    if (table === "delivery_riders") return riderQuery;
    if (table === "order_rider_assignments") return assignmentTable;
    throw new Error(`Unexpected table ${table}`);
  });
  return { admin: { from }, from, assignmentTable };
}

function assignmentForm() {
  const form = new FormData();
  form.set("order_id", orderId);
  form.set("rider_id", riderId);
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRestaurantAdmin).mockResolvedValue({
    restaurantId,
    userId: "user-1",
    role: "staff",
    restaurant: {
      id: restaurantId,
      name: "Chai Xpress",
      country_code: "AE",
      currency_code: "AED",
      phone_country_code: "971"
    }
  } as never);
  vi.mocked(sendRiderWhatsApp).mockResolvedValue({
    delivered: true,
    reason: "accepted",
    messageId: "web:message-1"
  });
});

describe("assignRiderToOrderAction", () => {
  it("saves a tenant-scoped assignment before sending the rider message", async () => {
    const { admin, assignmentTable } = makeAdmin();
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const result = await assignRiderToOrderAction({}, assignmentForm());

    expect(assignmentTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurant_id: restaurantId,
        order_id: orderId,
        rider_id: riderId,
        assigned_by_user_id: "user-1"
      })
    );
    expect(sendRiderWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId,
        phone: rider.phone
      })
    );
    expect(result.success).toContain("WhatsApp accepted");
  });

  it("never sends when the rider is outside the active tenant directory", async () => {
    const { admin, assignmentTable } = makeAdmin(order, null);
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const result = await assignRiderToOrderAction({}, assignmentForm());

    expect(result.error).toContain("no longer active");
    expect(assignmentTable.insert).not.toHaveBeenCalled();
    expect(sendRiderWhatsApp).not.toHaveBeenCalled();
  });
});
