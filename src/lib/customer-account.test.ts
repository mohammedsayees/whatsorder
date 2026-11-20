import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cleanCustomerName,
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
