import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  basketSignature,
  cleanCustomerName,
  dayKey,
  dayLabel,
  groupOrdersByDay,
  usualBasket,
  isActiveOrder,
  orderReference,
  orderSavings,
  parseCustomerAccountPayload,
  paymentMethodKind,
  paymentState,
  reorderableLines
} from "./customer-account";

describe("paymentState", () => {
  it("follows Stripe status for online payments", () => {
    const online = { payment_method: "Online Payment", status: "Preparing" };
    expect(paymentState({ ...online, online_payment_status: "paid" })).toBe("paid");
    expect(paymentState({ ...online, online_payment_status: "refunded" })).toBe("refunded");
    expect(paymentState({ ...online, online_payment_status: "pending" })).toBe("pending");
    expect(paymentState({ ...online, online_payment_status: null })).toBe("pending");
    expect(paymentState({ ...online, online_payment_status: "expired" })).toBe("failed");
    expect(
      paymentState({ ...online, status: "Cancelled", online_payment_status: "failed" })
    ).toBe("not_charged");
    // A cancelled order that was paid still reads as paid until refunded.
    expect(
      paymentState({ ...online, status: "Cancelled", online_payment_status: "paid" })
    ).toBe("paid");
  });

  it("treats pay-on-collection as paid only once completed", () => {
    const cash = { payment_method: "Cash on Delivery", online_payment_status: null };
    expect(paymentState({ ...cash, status: "Preparing" })).toBe("due");
    expect(paymentState({ ...cash, status: "Completed" })).toBe("paid");
    expect(paymentState({ ...cash, status: "Cancelled" })).toBe("not_charged");
  });

  it("shows customer credit as on account", () => {
    expect(
      paymentState({ payment_method: "Customer Credit", online_payment_status: null, status: "Completed" })
    ).toBe("on_account");
  });
});

describe("helpers", () => {
  it("maps payment methods", () => {
    expect(paymentMethodKind("Card on Delivery")).toBe("card");
    expect(paymentMethodKind("UPI")).toBe("upi");
    expect(paymentMethodKind(null)).toBe("unknown");
  });

  it("knows which orders are still active", () => {
    expect(isActiveOrder("Preparing")).toBe(true);
    expect(isActiveOrder("Completed")).toBe(false);
    expect(isActiveOrder("Cancelled")).toBe(false);
  });

  it("keeps only valid reorder lines", () => {
    expect(reorderableLines(null)).toEqual([]);
    expect(
      reorderableLines([
        { item_id: "a", name: "Karak", price: 2, quantity: 2 },
        { item_id: "b", name: "Zero", price: 2, quantity: 0 },
        { name: "No id", price: 2, quantity: 1 },
        null
      ])
    ).toEqual([{ item_id: "a", name: "Karak", price: 2, quantity: 2 }]);
  });

  it("formats references and savings", () => {
    expect(orderReference("43000000-0000-0000-0000-0000abcdef12")).toBe("ABCDEF12");
    expect(orderSavings({ discount_amount: 3, loyalty_discount: 2 })).toBe(5);
    expect(orderSavings({ discount_amount: null, loyalty_discount: -1 })).toBe(0);
  });

  it("cleans customer names", () => {
    expect(cleanCustomerName("  Sara   Ali ")).toBe("Sara Ali");
    expect(cleanCustomerName("   ")).toBeNull();
    expect(cleanCustomerName("x".repeat(81))).toBeNull();
    expect(cleanCustomerName(42)).toBeNull();
  });

  it("parses unexpected payloads without throwing", () => {
    expect(parseCustomerAccountPayload("971500000000", null)).toEqual({
      phone: "971500000000",
      profile: null,
      loyalty: null,
      loyaltyHistory: [],
      orders: [],
      hasMore: false
    });
    expect(
      parseCustomerAccountPayload("971500000000", { orders: "nope", has_more: "yes" }).hasMore
    ).toBe(false);
  });
});

describe("get_customer_account migration", () => {
  const sql = readFileSync(
    new URL("../../supabase/migrations/20261128090000_customer_account_page.sql", import.meta.url),
    "utf8"
  ).toLowerCase();

  it("is service-role only and read-only", () => {
    expect(sql).toContain("security invoker");
    expect(sql).not.toContain("security definer");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("stable");
    expect(sql).not.toMatch(/\b(insert|update|delete)\s+(into|from)?\s*public\./);
    expect(sql).not.toContain("create policy");
  });

  it("scopes every read to one restaurant and one phone", () => {
    expect(sql).toContain("where c.restaurant_id = p_restaurant_id\n      and c.phone = p_phone");
    expect(sql).toContain("where o.restaurant_id = p_restaurant_id\n      and o.customer_phone = p_phone");
    expect(sql).toContain("where lt.restaurant_id = p_restaurant_id");
    expect(sql).toContain("join customer c on c.id = lt.customer_id");
  });

  it("caps the page size", () => {
    expect(sql).toContain("least(greatest(coalesce(p_limit, 20), 1), 50)");
  });
});

function accountOrder(
  id: string,
  created_at: string,
  items: unknown,
  status = "Completed"
) {
  return {
    id,
    created_at,
    status,
    total: 10,
    subtotal: 10,
    delivery_fee: 0,
    discount_amount: 0,
    loyalty_discount: 0,
    promo_code: null,
    items,
    fulfilment_type: "pickup",
    payment_method: "Cash",
    online_payment_status: null,
    online_paid_at: null,
    points_earned: null,
    points_redeemed: null
  } as Parameters<typeof usualBasket>[0][number];
}

const karak = { item_id: "karak", name: "Karak", price: 1, quantity: 1, options: [{ option_id: "m", group_id: "size", name: "Medium", price_delta: 0 }] };
const coffee = { item_id: "coffee", name: "Coffee", price: 8, quantity: 1 };

describe("basketSignature", () => {
  it("ignores line order and price but not quantity or options", () => {
    expect(basketSignature([karak, coffee])).toBe(basketSignature([{ ...coffee, price: 99 }, karak]));
    expect(basketSignature([karak])).not.toBe(basketSignature([{ ...karak, quantity: 2 }]));
    expect(basketSignature([karak])).not.toBe(basketSignature([{ ...karak, options: [] }]));
  });
});

describe("usualBasket", () => {
  it("picks the most repeated basket, preferring the most recent on ties", () => {
    const orders = [
      accountOrder("a", "2026-11-20T10:00:00Z", [coffee]),
      accountOrder("b", "2026-11-19T10:00:00Z", [karak]),
      accountOrder("c", "2026-11-18T10:00:00Z", [karak]),
      accountOrder("d", "2026-11-17T10:00:00Z", [coffee])
    ];
    const usual = usualBasket(orders);
    expect(usual?.kind).toBe("usual");
    expect(usual?.order.id).toBe("a");
    expect(usual?.count).toBe(2);
  });

  it("falls back to the latest order, skipping cancelled and empty ones", () => {
    const orders = [
      accountOrder("x", "2026-11-21T10:00:00Z", [karak], "Cancelled"),
      accountOrder("y", "2026-11-20T10:00:00Z", null),
      accountOrder("z", "2026-11-19T10:00:00Z", [coffee]),
      accountOrder("w", "2026-11-18T10:00:00Z", [karak])
    ];
    expect(usualBasket(orders)).toMatchObject({ kind: "last", count: 1, order: { id: "z" } });
    expect(usualBasket([])).toBeNull();
  });
});

describe("order day grouping", () => {
  it("groups by the restaurant's local day", () => {
    // 21:30Z on the 20th is already the 21st in Dubai (UTC+4).
    expect(dayKey("2026-11-20T21:30:00Z", "Asia/Dubai")).toBe("2026-11-21");
    const groups = groupOrdersByDay(
      [
        { created_at: "2026-11-20T21:30:00Z" },
        { created_at: "2026-11-20T13:45:00Z" },
        { created_at: "2026-11-20T10:00:00Z" },
        { created_at: "2026-11-17T08:00:00Z" }
      ],
      "Asia/Dubai"
    );
    expect(groups.map((group) => [group.key, group.orders.length])).toEqual([
      ["2026-11-21", 1],
      ["2026-11-20", 2],
      ["2026-11-17", 1]
    ]);
  });

  it("labels today and yesterday, otherwise a short date", () => {
    expect(dayLabel("2026-11-22", "2026-11-22", "en-AE")).toBe("Today");
    expect(dayLabel("2026-11-21", "2026-11-22", "en-AE")).toBe("Yesterday");
    expect(dayLabel("2026-11-30", "2026-12-01", "en-AE")).toBe("Yesterday");
    expect(dayLabel("2026-11-22", "2026-11-22", "ar-AE")).toBe("اليوم");
    expect(dayLabel("2026-11-17", "2026-11-22", "en-AE")).toMatch(/Tue.*17.*Nov/);
    expect(dayLabel("2025-11-17", "2026-11-22", "en-AE")).toContain("2025");
  });
});
