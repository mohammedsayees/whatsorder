import { describe, expect, it } from "vitest";
import {
  canDiscountOrder,
  computeDiscountAmount,
  discountLimitPercentForRole,
  exceedsDiscountLimit,
  orderDiscountLabel,
  orderTotalsWithDiscount,
  parseOrderDiscount
} from "@/lib/order-discount";
import { staffPayloadToPrintableOrder, type StaffOrderPayload } from "@/lib/staff-order-payload";
import { canReduceStaffOrderItems } from "@/lib/order-item-reductions";
import { renderOrderTickets } from "@/lib/order-print";
import { readFileSync } from "node:fs";

describe("computeDiscountAmount", () => {
  it("takes a percentage of the subtotal, rounded to 2 decimals", () => {
    expect(computeDiscountAmount(33.33, { type: "percent", value: 10 })).toBe(3.33);
    expect(computeDiscountAmount(10.05, { type: "percent", value: 50 })).toBe(5.03);
  });

  it("caps fixed discounts at the subtotal", () => {
    expect(computeDiscountAmount(12, { type: "fixed", value: 5 })).toBe(5);
    expect(computeDiscountAmount(12, { type: "fixed", value: 50 })).toBe(12);
  });

  it("treats missing, zero or invalid input as no discount", () => {
    expect(computeDiscountAmount(12, null)).toBe(0);
    expect(computeDiscountAmount(12, { type: "fixed", value: 0 })).toBe(0);
    expect(computeDiscountAmount(12, { type: "percent", value: Number.NaN })).toBe(0);
    expect(computeDiscountAmount(0, { type: "percent", value: 10 })).toBe(0);
  });
});

describe("orderTotalsWithDiscount", () => {
  it("never discounts the delivery fee", () => {
    expect(orderTotalsWithDiscount(40, 10, { type: "percent", value: 100 })).toEqual({
      subtotal: 40,
      discountAmount: 40,
      deliveryFee: 10,
      total: 10
    });
  });

  it("avoids floating point drift in the total", () => {
    expect(orderTotalsWithDiscount(0.3, 0.1, { type: "fixed", value: 0.1 }).total).toBe(0.3);
  });
});

describe("staff discount limits", () => {
  it("is unlimited for owners, managers and restaurant admins", () => {
    for (const role of ["owner", "manager", "restaurant_admin"]) {
      expect(discountLimitPercentForRole(role, 10)).toBeNull();
    }
  });

  it("caps the staff role at the restaurant setting, defaulting to 10%", () => {
    expect(discountLimitPercentForRole("staff", 25)).toBe(25);
    expect(discountLimitPercentForRole("staff", undefined)).toBe(10);
    expect(exceedsDiscountLimit(50, 5, 10)).toBe(false);
    expect(exceedsDiscountLimit(50, 5.01, 10)).toBe(true);
    expect(exceedsDiscountLimit(50, 50, null)).toBe(false);
  });
});

describe("parseOrderDiscount", () => {
  it("accepts a valid discount and trims the reason", () => {
    expect(parseOrderDiscount({ type: "percent", value: "10", reason: "  Regular  " })).toEqual({
      ok: true,
      discount: { type: "percent", value: 10, reason: "Regular" }
    });
  });

  it("treats empty input as no discount", () => {
    expect(parseOrderDiscount(undefined)).toEqual({ ok: true, discount: null });
    expect(parseOrderDiscount({ type: "percent", value: "" })).toEqual({ ok: true, discount: null });
  });

  it("rejects bad types, negatives, >100% and a missing reason", () => {
    expect(parseOrderDiscount({ type: "bogus", value: 5, reason: "x" }).ok).toBe(false);
    expect(parseOrderDiscount({ type: "fixed", value: -5, reason: "x" }).ok).toBe(false);
    expect(parseOrderDiscount({ type: "percent", value: 101, reason: "x" }).ok).toBe(false);
    expect(parseOrderDiscount({ type: "fixed", value: 5, reason: " " }).ok).toBe(false);
    expect(parseOrderDiscount("10%").ok).toBe(false);
  });
});

const openOrder = {
  status: "Preparing" as const,
  payment_method: null,
  online_payment_status: null,
  loyalty_discount: 0,
  points_redeemed: 0
};

describe("canDiscountOrder", () => {
  it("allows open unpaid orders only", () => {
    expect(canDiscountOrder(openOrder)).toBe(true);
    expect(canDiscountOrder({ ...openOrder, status: "Completed" })).toBe(false);
    expect(canDiscountOrder({ ...openOrder, payment_method: "Cash on Delivery" })).toBe(false);
    expect(canDiscountOrder({ ...openOrder, online_payment_status: "pending" })).toBe(false);
    expect(canDiscountOrder({ ...openOrder, loyalty_discount: 2 })).toBe(false);
  });

  it("labels percentage discounts", () => {
    expect(orderDiscountLabel({ discount_type: "percent", discount_value: 15 })).toBe("Discount 15%");
    expect(orderDiscountLabel({ discount_type: "fixed", discount_value: 5 })).toBe("Discount");
  });
});

const payload: StaffOrderPayload = {
  clientOrderId: "8f14e45f-ceea-467a-9f0e-6b0f3f1f2a11",
  restaurantId: "r1",
  punchedAt: new Date().toISOString(),
  action: "kitchen",
  fulfilmentType: "takeaway",
  items: [{ item_id: "tea", name: "Tea", price: 5, quantity: 4 }],
  tableNumber: "",
  deliveryArea: "",
  deliveryAddress: "",
  deliveryLandmark: "",
  carPlateNumber: "",
  carDescription: "",
  customerName: "",
  customerPhone: "",
  notes: "",
  discount: { type: "percent", value: 10, reason: "Regular" }
};

describe("discounts on staff tickets", () => {
  it("carries the discount into an offline printable order", () => {
    const order = staffPayloadToPrintableOrder(payload);
    expect(order.subtotal).toBe(20);
    expect(order.discount_amount).toBe(2);
    expect(order.total).toBe(18);
    expect(order.discount_reason).toBe("Regular");
  });

  it("prints the discount on the customer receipt", () => {
    const html = renderOrderTickets({
      order: staffPayloadToPrintableOrder(payload),
      restaurant: { name: "Cafe", whatsapp_number: "971500000000", address: null } as never,
      kinds: ["receipt"],
      reprint: { kot: false, receipt: false }
    });
    expect(html).toContain("Discount 10%");
  });

  it("blocks item removal on a discounted ticket", () => {
    const order = { ...staffPayloadToPrintableOrder(payload), source: "staff" as const };
    expect(canReduceStaffOrderItems(order)).toBe(false);
    expect(canReduceStaffOrderItems({ ...order, discount_amount: 0 })).toBe(true);
  });
});

describe("staff order discounts migration", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20261126090000_staff_order_discounts.sql", import.meta.url),
    "utf8"
  );

  it("keeps the discount RPC service-role only and reconciles totals", () => {
    expect(migration).toMatch(/revoke all on function public\.apply_order_discount\([\s\S]*?\) from public, anon, authenticated;/);
    expect(migration).toMatch(/grant execute on function public\.apply_order_discount\([\s\S]*?\) to service_role;/);
    expect(migration).toContain("orders_discount_total_reconciles");
    expect(migration).not.toMatch(/grant (insert|update|delete)[^;]*order_discount_events[^;]*authenticated/i);
  });
});
