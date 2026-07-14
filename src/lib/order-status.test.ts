import { describe, expect, it } from "vitest";
import {
  canCancelOrder,
  getNextOrderStatus,
  isValidOrderStatusTransition
} from "@/lib/order-status";

describe("order status transitions", () => {
  it("uses the delivery workflow", () => {
    expect(getNextOrderStatus("delivery", "Preparing")).toBe("Out for Delivery");
    expect(isValidOrderStatusTransition("delivery", "Preparing", "Accepted")).toBe(false);
  });

  it("uses the dine-in workflow", () => {
    expect(getNextOrderStatus("dine_in", "Preparing")).toBe("Ready to Serve");
    expect(isValidOrderStatusTransition("dine_in", "Preparing", "Out for Delivery")).toBe(false);
  });

  it("completes collection orders after preparation", () => {
    expect(getNextOrderStatus("takeaway", "Preparing")).toBe("Completed");
    expect(getNextOrderStatus("car_pickup", "Preparing")).toBe("Completed");
  });

  it("allows cancellation only before a terminal status", () => {
    expect(canCancelOrder("Out for Delivery")).toBe(true);
    expect(canCancelOrder("Completed")).toBe(false);
    expect(canCancelOrder("Cancelled")).toBe(false);
  });
});
