import { describe, expect, it } from "vitest";
import { getCustomerInsights } from "./customer-insights";
import type { FulfilmentType, Order, OrderStatus } from "./types";

function order({
  createdAt,
  fulfilment = "delivery",
  items,
  status = "Completed",
  total
}: {
  createdAt: string;
  fulfilment?: FulfilmentType;
  items: Array<{ id: string; name: string; quantity: number }>;
  status?: OrderStatus;
  total: number;
}) {
  return {
    created_at: createdAt,
    fulfilment_type: fulfilment,
    items: items.map((item) => ({
      item_id: item.id,
      name: item.name,
      price: total,
      quantity: item.quantity
    })),
    status,
    total
  } as Order;
}

describe("customer insights", () => {
  it("uses completed orders and counts product appearances across separate orders", () => {
    const insights = getCustomerInsights(
      [
        order({
          createdAt: "2026-06-18T10:00:00.000Z",
          items: [{ id: "burger", name: "Zinger Burger", quantity: 5 }],
          total: 50
        }),
        order({
          createdAt: "2026-06-19T10:00:00.000Z",
          fulfilment: "takeaway",
          items: [{ id: "burger", name: "Zinger Burger", quantity: 1 }],
          total: 15
        }),
        order({
          createdAt: "2026-06-20T10:00:00.000Z",
          items: [{ id: "fries", name: "Fries", quantity: 10 }],
          status: "Cancelled",
          total: 100
        })
      ],
      new Date("2026-06-20T12:00:00.000Z")
    );

    expect(insights.completedOrderCount).toBe(2);
    expect(insights.completedSpend).toBe(65);
    expect(insights.mostOrderedItems).toEqual([
      {
        itemId: "burger",
        name: "Zinger Burger",
        orderCount: 2,
        quantity: 6
      }
    ]);
    expect(insights.preferredFulfilment).toBe("takeaway");
    expect(insights.segment).toBe("Repeat");
  });

  it("marks customers inactive after 30 days even if they previously qualified as VIP", () => {
    const insights = getCustomerInsights(
      [
        order({
          createdAt: "2026-04-01T10:00:00.000Z",
          items: [{ id: "karak", name: "Karak", quantity: 1 }],
          total: 300
        })
      ],
      new Date("2026-06-20T10:00:00.000Z")
    );

    expect(insights.daysSinceLastOrder).toBe(80);
    expect(insights.segment).toBe("Inactive");
  });
});
