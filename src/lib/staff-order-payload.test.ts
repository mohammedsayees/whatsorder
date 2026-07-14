import { describe, expect, it } from "vitest";
import {
  clampPunchedAt,
  isClientOrderId,
  isDuplicateClientOrderError,
  isStaffOrderActionKind,
  payloadField,
  staffPayloadToPrintableOrder,
  type StaffOrderPayload
} from "@/lib/staff-order-payload";

describe("isClientOrderId", () => {
  it("accepts a well-formed UUID", () => {
    expect(isClientOrderId("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
  });

  it("rejects non-UUID strings and non-strings", () => {
    expect(isClientOrderId("not-a-uuid")).toBe(false);
    expect(isClientOrderId("")).toBe(false);
    expect(isClientOrderId(undefined)).toBe(false);
    expect(isClientOrderId(42)).toBe(false);
  });
});

describe("isStaffOrderActionKind", () => {
  it("accepts the three punch actions", () => {
    expect(isStaffOrderActionKind("kitchen")).toBe(true);
    expect(isStaffOrderActionKind("paid_cash")).toBe(true);
    expect(isStaffOrderActionKind("paid_card")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isStaffOrderActionKind("refund")).toBe(false);
    expect(isStaffOrderActionKind(null)).toBe(false);
  });
});

describe("clampPunchedAt", () => {
  const now = new Date("2026-07-04T12:00:00.000Z");

  it("keeps a valid recent timestamp (queued during an outage)", () => {
    const twoHoursAgo = "2026-07-04T10:00:00.000Z";
    expect(clampPunchedAt(twoHoursAgo, now)).toBe(twoHoursAgo);
  });

  it("falls back to now for a future timestamp (bad device clock)", () => {
    expect(clampPunchedAt("2026-07-04T13:00:00.000Z", now)).toBe(now.toISOString());
  });

  it("falls back to now for a timestamp older than the backlog window", () => {
    expect(clampPunchedAt("2026-06-01T12:00:00.000Z", now)).toBe(now.toISOString());
  });

  it("falls back to now for unparseable input", () => {
    expect(clampPunchedAt("whenever", now)).toBe(now.toISOString());
    expect(clampPunchedAt(undefined, now)).toBe(now.toISOString());
  });
});

describe("isDuplicateClientOrderError", () => {
  it("detects a replay collision on the idempotency index", () => {
    expect(
      isDuplicateClientOrderError({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "orders_restaurant_client_order_key"'
      })
    ).toBe(true);
  });

  it("ignores other unique violations and null errors", () => {
    expect(
      isDuplicateClientOrderError({
        code: "23505",
        message: 'duplicate key value violates unique constraint "orders_pkey"'
      })
    ).toBe(false);
    expect(isDuplicateClientOrderError({ code: "23503", message: "fk" })).toBe(false);
    expect(isDuplicateClientOrderError(null)).toBe(false);
  });
});

describe("payloadField", () => {
  it("trims and caps length, and coerces non-strings to empty", () => {
    expect(payloadField("  hi  ", 10)).toBe("hi");
    expect(payloadField("abcdef", 3)).toBe("abc");
    expect(payloadField(123, 10)).toBe("");
    expect(payloadField(undefined, 10)).toBe("");
  });
});

describe("staffPayloadToPrintableOrder", () => {
  const basePayload: StaffOrderPayload = {
    clientOrderId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    restaurantId: "rest-1",
    punchedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    action: "paid_cash",
    fulfilmentType: "dine_in",
    items: [
      { item_id: "i1", name: "Green tea", price: 1, quantity: 2 },
      { item_id: "i2", name: "Cake", price: 3, quantity: 1 }
    ],
    tableNumber: "5",
    deliveryArea: "",
    deliveryAddress: "",
    deliveryLandmark: "",
    carPlateNumber: "",
    carDescription: "",
    customerName: "",
    customerPhone: "",
    notes: "extra hot"
  };

  it("projects a queued payload into a printable Order with mapped status", () => {
    const order = staffPayloadToPrintableOrder(basePayload);
    expect(order.id).toBe(basePayload.clientOrderId);
    expect(order.status).toBe("Completed");
    expect(order.payment_method).toBe("Cash on Delivery");
    expect(order.table_number).toBe("5");
    expect(order.customer_name).toBe("Walk-in customer");
    expect(order.notes).toBe("extra hot");
    // Indicative subtotal from client prices: 2×1 + 1×3 = 5.
    expect(order.subtotal).toBe(5);
    expect(order.created_at).toBe(basePayload.punchedAt);
  });

  it("maps a kitchen ticket to Preparing with no payment method", () => {
    const order = staffPayloadToPrintableOrder({ ...basePayload, action: "kitchen" });
    expect(order.status).toBe("Preparing");
    expect(order.payment_method).toBeNull();
  });
});
