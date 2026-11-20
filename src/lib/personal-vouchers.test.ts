import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseAdmin } from "@/lib/supabase";
import { cleanCustomerSearch, maskPhone, phoneDigits } from "@/lib/promo-assignments";
import { PROMO_ERRORS } from "@/lib/promo-codes";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));

import { evaluatePromoCode } from "@/lib/promo-code-data";

const restaurantId = "23000000-0000-0000-0000-000000000001";

function promoRow(audience: "everyone" | "assigned") {
  return {
    id: "43000000-0000-4000-8000-000000000001",
    code: "JUSTYOU",
    description: null,
    discount_type: "fixed",
    discount_value: 5,
    max_discount: null,
    min_subtotal: 0,
    starts_at: null,
    ends_at: null,
    max_redemptions: null,
    max_redemptions_per_customer: null,
    first_order_only: false,
    is_active: true,
    audience
  };
}

function mockSupabase(audience: "everyone" | "assigned", assigned: boolean) {
  const rpc = vi.fn().mockResolvedValue({
    data: { total_used: 0, customer_used: 0, customer_has_orders: false, customer_assigned: assigned },
    error: null
  });
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: promoRow(audience), error: null })
  };
  vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn(() => query), rpc } as never);
  return rpc;
}

describe("evaluatePromoCode with personal codes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses an assigned code for a number that wasn't given it", async () => {
    const rpc = mockSupabase("assigned", false);
    const result = await evaluatePromoCode(restaurantId, "JUSTYOU", 50, "971500000001");
    expect(result).toEqual({ ok: false, error: PROMO_ERRORS.notForYou });
    expect(rpc).toHaveBeenCalledWith("get_promo_code_usage", expect.objectContaining({ target_phone: "971500000001" }));
  });

  it("accepts it for a recipient", async () => {
    mockSupabase("assigned", true);
    const result = await evaluatePromoCode(restaurantId, "JUSTYOU", 50, "971500000001");
    expect(result.ok).toBe(true);
  });

  it("defers the check in the phone-less Apply preview (the order is re-checked)", async () => {
    const rpc = mockSupabase("assigned", false);
    const result = await evaluatePromoCode(restaurantId, "JUSTYOU", 50, null);
    expect(result.ok).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("leaves public codes alone", async () => {
    const rpc = mockSupabase("everyone", false);
    const result = await evaluatePromoCode(restaurantId, "JUSTYOU", 50, "971500000001");
    expect(result.ok).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("promo assignment helpers", () => {
  it("cleans searches of filter and wildcard characters", () => {
    expect(cleanCustomerSearch("  Sara,  (Ali)% ")).toBe("Sara Ali");
    expect(cleanCustomerSearch("a")).toBeNull();
    expect(cleanCustomerSearch("%_")).toBeNull();
    expect(cleanCustomerSearch(42)).toBeNull();
    expect(cleanCustomerSearch("x".repeat(80))?.length).toBe(60);
  });

  it("finds phone digits only when there are enough", () => {
    expect(phoneDigits("050 123")).toBe("050123");
    expect(phoneDigits("Sara 12")).toBeNull();
  });

  it("masks phones for the owner's picker", () => {
    expect(maskPhone("971501234567")).toBe("+97150 ••• 4567");
    expect(maskPhone("1234")).toBe("1234");
  });
});

describe("personal vouchers migration", () => {
  const sql = readFileSync(
    new URL("../../supabase/migrations/20261201090000_personal_vouchers.sql", import.meta.url),
    "utf8"
  ).toLowerCase();

  it("enforces the audience at redemption without touching the order RPC", () => {
    expect(sql).toContain("before insert on public.promo_code_redemptions");
    expect(sql).toContain("raise exception 'promo code is not valid for this customer'");
    expect(sql).not.toContain("function public.create_order_with_customer_v6");
  });

  it("keeps assignments tenant-consistent and read-only for browsers", () => {
    expect(sql).toContain("foreign key (promo_code_id, restaurant_id)\n    references public.promo_codes(id, restaurant_id)");
    expect(sql).toContain("foreign key (customer_id, restaurant_id)\n    references public.customers(id, restaurant_id)");
    expect(sql).toContain("revoke all on table public.promo_code_assignments from anon, authenticated;");
    expect(sql).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/);
  });

  it("defaults every existing code to everyone", () => {
    expect(sql).toContain("add column if not exists audience text not null default 'everyone'");
  });
});
