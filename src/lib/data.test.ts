import { describe, expect, it } from "vitest";
import { getAnalytics, getDashboardTrendFromOrders } from "./data";
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

describe("dashboard trend fallback", () => {
  it("zero-fills seven daily buckets and only counts completed sales", () => {
    const trend = getDashboardTrendFromOrders(
      [
        order("Completed", 20, "Karak"),
        order("Cancelled", 100, "Cancelled Burger"),
        order("Preparing", 50, "Pending Fries")
      ],
      "7d"
    );

    expect(trend.days).toHaveLength(7);
    const today = trend.days[trend.days.length - 1];
    expect(today.orders).toBe(3);
    expect(today.sales).toBe(20);
    expect(trend.days.slice(0, 6).every((day) => day.orders === 0)).toBe(true);
    expect(trend.monthSales).toBe(20);
    expect(trend.monthOrders).toBe(3);
    expect(trend.inProgressOrders).toBe(1);
    expect(trend.topItem).toBe("Karak");
    expect(trend.topItemQuantity).toBe(1);
  });

  it("sizes the window by range mode", () => {
    expect(getDashboardTrendFromOrders([], "30d").days).toHaveLength(30);
    const mtd = getDashboardTrendFromOrders([], "mtd");
    expect(mtd.days.length).toBeGreaterThanOrEqual(1);
    expect(mtd.days.length).toBeLessThanOrEqual(31);
    expect(mtd.days[0].date.endsWith("-01")).toBe(true);
  });
});
