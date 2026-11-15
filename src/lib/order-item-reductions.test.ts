import { describe, expect, it } from "vitest";
import { canReduceStaffOrderItems } from "@/lib/order-item-reductions";

const eligible = {
  source: "staff" as const,
  payment_method: null,
  status: "Preparing" as const,
  loyalty_discount: 0,
  points_earned: 0,
  points_redeemed: 0,
  items: [{ item_id: "tea", name: "Tea", price: 5, quantity: 2 }]
};

describe("canReduceStaffOrderItems", () => {
  it("allows a partial correction on an active unpaid staff order", () => {
    expect(canReduceStaffOrderItems(eligible)).toBe(true);
  });

  it("protects paid, completed, non-staff and single-item orders", () => {
    expect(canReduceStaffOrderItems({ ...eligible, payment_method: "Cash on Delivery" })).toBe(false);
    expect(canReduceStaffOrderItems({ ...eligible, status: "Completed" })).toBe(false);
    expect(canReduceStaffOrderItems({ ...eligible, source: "customer" })).toBe(false);
    expect(canReduceStaffOrderItems({ ...eligible, items: [{ ...eligible.items[0], quantity: 1 }] })).toBe(false);
  });
});
