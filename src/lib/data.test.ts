import { describe, expect, it } from "vitest";
import { getAnalytics } from "./data";
import type { Customer, Order } from "./types";

function order(status: Order["status"], total: number, itemName: string): Order {
  return {
    created_at: new Date().toISOString(),
    items: [
      {
        item_id: itemName,
        name: itemName,
        name_ar: null,
        price: total,
        quantity: 1
      }
    ],
    status,
    total
  } as Order;
}

describe("restaurant analytics", () => {
  it("uses completed orders for revenue, average value, and top-selling items", () => {
    const analytics = getAnalytics(
      [
        order("Completed", 20, "Karak"),
        order("Cancelled", 100, "Cancelled Burger"),
        order("New", 50, "Pending Fries")
      ],
      [] as Customer[]
    );

    expect(analytics.todaysOrders).toBe(3);
    expect(analytics.todaysRevenue).toBe(20);
    expect(analytics.averageOrderValue).toBe(20);
    expect(analytics.topSellingItem).toBe("Karak");
  });
});
