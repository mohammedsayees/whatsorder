import { describe, expect, it } from "vitest";
import {
  classifyCustomerSegment,
  customerBuysKeyword,
  getCustomerInsights,
  isCustomerContactable,
  isHighAovCustomer,
  isMidnightCustomer,
  isMorningCustomer,
  matchesSegmentFilter
} from "./customer-insights";
import type { Customer, FulfilmentType, Order, OrderStatus } from "./types";

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "cust-1",
    restaurant_id: "rest-1",
    name: "Test Customer",
    phone: "971500000000",
    delivery_area: "",
    delivery_address: "",
    default_latitude: null,
    default_longitude: null,
    default_google_maps_url: null,
    default_address_text: null,
    default_landmark: null,
    total_orders: 0,
    total_spend: 0,
    last_order_at: null,
    marketing_opt_in: false,
    consent_order_processing: true,
    consent_marketing: false,
    consent_timestamp: null,
    marketing_consent_withdrawn_at: null,
    loyalty_points_balance: 0,
    lifetime_points_earned: 0,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides
  };
}

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

const now = new Date("2026-07-05T12:00:00.000Z");
const recent = "2026-07-04T12:00:00.000Z";

describe("classifyCustomerSegment (denormalized columns)", () => {
  it("returns New for a single recent order", () => {
    expect(
      classifyCustomerSegment(
        customer({ total_orders: 1, total_spend: 20, last_order_at: recent }),
        now
      )
    ).toBe("New");
  });

  it("returns Repeat at two completed orders", () => {
    expect(
      classifyCustomerSegment(
        customer({ total_orders: 2, total_spend: 40, last_order_at: recent }),
        now
      )
    ).toBe("Repeat");
  });

  it("returns VIP by order count or by spend", () => {
    expect(
      classifyCustomerSegment(
        customer({ total_orders: 5, total_spend: 100, last_order_at: recent }),
        now
      )
    ).toBe("VIP");
    expect(
      classifyCustomerSegment(
        customer({ total_orders: 2, total_spend: 250, last_order_at: recent }),
        now
      )
    ).toBe("VIP");
  });

  it("marks Inactive after 30 days even if otherwise VIP", () => {
    expect(
      classifyCustomerSegment(
        customer({
          total_orders: 9,
          total_spend: 900,
          last_order_at: "2026-05-01T12:00:00.000Z"
        }),
        now
      )
    ).toBe("Inactive");
  });
});

describe("isCustomerContactable", () => {
  it("is contactable only with opt-in + consent + no withdrawal", () => {
    expect(
      isCustomerContactable(
        customer({ marketing_opt_in: true, consent_marketing: true })
      )
    ).toBe(true);
  });

  it("is not contactable when consent is missing", () => {
    expect(
      isCustomerContactable(
        customer({ marketing_opt_in: true, consent_marketing: false })
      )
    ).toBe(false);
  });

  it("is not contactable when consent was withdrawn", () => {
    expect(
      isCustomerContactable(
        customer({
          marketing_opt_in: true,
          consent_marketing: true,
          marketing_consent_withdrawn_at: "2026-07-01T00:00:00.000Z"
        })
      )
    ).toBe(false);
  });

  it("is not contactable without opt-in", () => {
    expect(
      isCustomerContactable(
        customer({ marketing_opt_in: false, consent_marketing: true })
      )
    ).toBe(false);
  });
});

describe("value and time segments", () => {
  it("flags high average order value", () => {
    expect(
      isHighAovCustomer(customer({ total_orders: 2, total_spend: 160 }))
    ).toBe(true);
    expect(
      isHighAovCustomer(customer({ total_orders: 2, total_spend: 40 }))
    ).toBe(false);
    expect(isHighAovCustomer(customer({ total_orders: 0, total_spend: 0 }))).toBe(false);
  });

  it("detects morning regulars (04:00–10:00 UAE)", () => {
    const orders = [
      // 06:00 and 07:00 Asia/Dubai (UTC+4)
      order({ createdAt: "2026-07-01T02:00:00.000Z", items: [{ id: "k", name: "Karak", quantity: 1 }], total: 5 }),
      order({ createdAt: "2026-07-02T03:00:00.000Z", items: [{ id: "k", name: "Karak", quantity: 1 }], total: 5 })
    ];
    expect(isMorningCustomer(orders)).toBe(true);
    expect(isMidnightCustomer(orders)).toBe(false);
  });

  it("detects midnight regulars (00:00–04:00 UAE)", () => {
    const orders = [
      // 02:00 and 03:00 Asia/Dubai
      order({ createdAt: "2026-06-30T22:00:00.000Z", items: [{ id: "k", name: "Karak", quantity: 1 }], total: 5 }),
      order({ createdAt: "2026-06-30T23:00:00.000Z", items: [{ id: "k", name: "Karak", quantity: 1 }], total: 5 })
    ];
    expect(isMidnightCustomer(orders)).toBe(true);
    expect(isMorningCustomer(orders)).toBe(false);
  });

  it("matches item buyers by keyword on completed orders only", () => {
    const orders = [
      order({ createdAt: recent, items: [{ id: "k", name: "Special Karak Chai", quantity: 1 }], total: 5 }),
      order({ createdAt: recent, items: [{ id: "b", name: "Zinger Burger", quantity: 1 }], status: "Cancelled", total: 20 })
    ];
    expect(customerBuysKeyword(orders, "karak")).toBe(true);
    expect(customerBuysKeyword(orders, "burger")).toBe(false);
  });
});

describe("matchesSegmentFilter", () => {
  it("routes fulfilment segments through preferred fulfilment", () => {
    const deliveryCustomer = customer({ total_orders: 2, last_order_at: recent });
    const orders = [
      order({ createdAt: "2026-07-01T02:00:00.000Z", fulfilment: "delivery", items: [{ id: "k", name: "Karak", quantity: 1 }], total: 5 }),
      order({ createdAt: "2026-07-02T02:00:00.000Z", fulfilment: "delivery", items: [{ id: "k", name: "Karak", quantity: 1 }], total: 5 })
    ];
    expect(matchesSegmentFilter("delivery", deliveryCustomer, orders, now)).toBe(true);
    expect(matchesSegmentFilter("takeaway", deliveryCustomer, orders, now)).toBe(false);
    expect(matchesSegmentFilter("all", deliveryCustomer, orders, now)).toBe(true);
  });

  it("routes consent segments through contactability", () => {
    const optedIn = customer({ marketing_opt_in: true, consent_marketing: true });
    expect(matchesSegmentFilter("marketing_opt_in", optedIn, [], now)).toBe(true);
    expect(matchesSegmentFilter("no_consent", optedIn, [], now)).toBe(false);
    expect(matchesSegmentFilter("no_consent", customer(), [], now)).toBe(true);
  });
});
