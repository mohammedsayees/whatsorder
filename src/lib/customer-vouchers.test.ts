import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkoutHrefForVoucher,
  describeVoucher,
  parseCustomerVouchers,
  promoCodeFromQuery,
  voucherTerms
} from "./customer-vouchers";

const aed = (value: number) => `AED ${value}`;

describe("parseCustomerVouchers", () => {
  it("keeps valid rows and coerces numeric strings", () => {
    const vouchers = parseCustomerVouchers([
      {
        code: "save10",
        discount_type: "percent",
        discount_value: "10",
        max_discount: "5",
        min_subtotal: "20",
        ends_at: "2026-12-01T00:00:00Z",
        first_order_only: false,
        uses_left: 2
      },
      { code: "FIVE", discount_type: "fixed", discount_value: 5, min_subtotal: 0, uses_left: null }
    ]);
    expect(vouchers).toEqual([
      {
        code: "SAVE10",
        discountType: "percent",
        discountValue: 10,
        maxDiscount: 5,
        minSubtotal: 20,
        endsAt: "2026-12-01T00:00:00Z",
        firstOrderOnly: false,
        usesLeft: 2
      },
      {
        code: "FIVE",
        discountType: "fixed",
        discountValue: 5,
        maxDiscount: null,
        minSubtotal: 0,
        endsAt: null,
        firstOrderOnly: false,
        usesLeft: null
      }
    ]);
  });

  it("drops malformed rows", () => {
    expect(
      parseCustomerVouchers([
        { code: "x", discount_type: "fixed", discount_value: 5 },
        { code: "BAD TYPE", discount_type: "bogus", discount_value: 5 },
        { code: "ZERO", discount_type: "fixed", discount_value: 0 },
        null
      ])
    ).toEqual([]);
    expect(parseCustomerVouchers({ code: "SAVE10" })).toEqual([]);
  });
});

describe("voucher helpers", () => {
  const voucher = parseCustomerVouchers([
    { code: "SAVE10", discount_type: "percent", discount_value: 10, max_discount: 5, min_subtotal: 20 }
  ])[0];

  it("describes vouchers in both languages", () => {
    expect(describeVoucher(voucher, "en", aed)).toBe("10% off (up to AED 5)");
    expect(describeVoucher(voucher, "ar", aed)).toBe("خصم 10% (حتى AED 5)");
    expect(describeVoucher({ discountType: "fixed", discountValue: 5, maxDiscount: null }, "en", aed)).toBe("AED 5 off");
  });

  it("maps to the checkout's promo terms", () => {
    expect(voucherTerms(voucher)).toEqual({
      code: "SAVE10",
      discountType: "percent",
      discountValue: 10,
      maxDiscount: 5,
      minSubtotal: 20
    });
  });

  it("only accepts well-formed codes from the query string", () => {
    expect(promoCodeFromQuery(" save10 ")).toBe("SAVE10");
    expect(promoCodeFromQuery("<script>")).toBeNull();
    expect(promoCodeFromQuery(["SAVE10"])).toBeNull();
    expect(promoCodeFromQuery(undefined)).toBeNull();
    expect(checkoutHrefForVoucher("chaixpress", "SAVE10")).toBe("/r/chaixpress/checkout?promo=SAVE10");
  });
});

describe("customer_vouchers migration", () => {
  const sql = readFileSync(
    new URL("../../supabase/migrations/20261130090000_customer_vouchers.sql", import.meta.url),
    "utf8"
  ).toLowerCase();

  it("keeps existing codes private by default", () => {
    expect(sql).toContain("add column if not exists show_in_account boolean not null default false");
  });

  it("is read-only, service-role only, and scoped to one restaurant", () => {
    expect(sql).toContain("security invoker");
    expect(sql).not.toContain("security definer");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("where promo.restaurant_id = p_restaurant_id\n      and promo.show_in_account");
    expect(sql).not.toMatch(/\b(insert into|delete from|update public\.)/);
  });

  it("never returns the owner's private note", () => {
    const output = sql.slice(sql.indexOf("jsonb_build_object("));
    expect(output).not.toContain("description");
  });
});
