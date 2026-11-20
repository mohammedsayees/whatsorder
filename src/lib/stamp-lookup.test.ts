import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { maskedPhone, stampGreetingName, stampLookupPhone, stampMessage, stampSummary } from "./stamp-lookup";

describe("stampLookupPhone", () => {
  it("normalizes complete UAE numbers the same way orders are saved", () => {
    expect(stampLookupPhone("050 123 4567")).toBe("971501234567");
    expect(stampLookupPhone("+971 50 123 4567")).toBe("971501234567");
    expect(stampLookupPhone("00971501234567")).toBe("971501234567");
    expect(stampLookupPhone("501234567")).toBe("971501234567");
  });

  it("waits for a complete number", () => {
    expect(stampLookupPhone("050")).toBeNull();
    expect(stampLookupPhone("05012345")).toBeNull();
    expect(stampLookupPhone("97150123456")).toBeNull();
    expect(stampLookupPhone("9715012345678")).toBeNull();
    expect(stampLookupPhone("")).toBeNull();
  });

  it("handles India numbers for Indian cafés", () => {
    expect(stampLookupPhone("98765 43210", "91")).toBe("919876543210");
  });
});

describe("stampGreetingName", () => {
  it("returns only a first name", () => {
    expect(stampGreetingName("Sara Ali Khan")).toBe("Sara");
    expect(stampGreetingName("Walk-in customer")).toBeNull();
    expect(stampGreetingName("Customer")).toBeNull();
    expect(stampGreetingName(null)).toBeNull();
  });
});

describe("stampMessage", () => {
  it("covers new, in-progress and reward-ready customers", () => {
    expect(stampMessage({ status: "new", required: 7, reward: "Crunch Burger" })?.text).toBe(
      "New customer · first stamp today (7 for a free Crunch Burger)"
    );
    expect(stampMessage({ status: "known", name: "Sara", stamps: 4, required: 7, reward: "Crunch Burger" })).toEqual({
      tone: "progress",
      text: "Sara · 4/7 stamps · 3 more for a free Crunch Burger"
    });
    expect(stampMessage({ status: "known", name: null, stamps: 7, required: 7, reward: "Crunch Burger" })).toEqual({
      tone: "ready",
      text: "Reward ready: free Crunch Burger (7/7)"
    });
    expect(stampMessage({ status: "off" })).toBeNull();
  });
});

describe("staff_order_stamps migration", () => {
  const sql = readFileSync(
    new URL("../../supabase/migrations/20261202090000_staff_order_stamps.sql", import.meta.url),
    "utf8"
  ).toLowerCase();

  it("only runs for staff orders with a phone, after insert", () => {
    expect(sql).toContain("after insert on public.orders");
    expect(sql).toContain("when (new.source = 'staff' and nullif(btrim(coalesce(new.customer_phone, '')), '') is not null)");
  });

  it("never overwrites an existing customer or grants marketing consent", () => {
    expect(sql).toContain("on conflict (restaurant_id, phone) do nothing");
    expect(sql).not.toMatch(/consent_marketing\s*=\s*true/);
    expect(sql).not.toContain("marketing_opt_in");
  });

  it("awards at most one stamp per order", () => {
    expect(sql).toContain("on conflict (order_id) where type = 'earned' and order_id is not null");
  });
});

describe("stampSummary / maskedPhone", () => {
  it("fits the collapsed counter chip on one line", () => {
    expect(stampSummary({ status: "off" })).toBeNull();
    expect(stampSummary({ status: "new", required: 10, reward: "chai" })).toBe("New · first stamp");
    expect(stampSummary({ status: "known", name: "Sara", stamps: 4, required: 10, reward: null })).toBe("Sara · 4/10 stamps");
    expect(stampSummary({ status: "known", name: null, stamps: 10, required: 10, reward: null })).toBe("Reward ready 🎁");
  });

  it("masks the middle of the number", () => {
    expect(maskedPhone("050 123 4123")).toBe("050…123");
    expect(maskedPhone("0501")).toBe("0501");
  });
});

describe("counter_reward_redemption migration", () => {
  const sql = readFileSync(
    new URL("../../supabase/migrations/20261203090000_counter_reward_redemption.sql", import.meta.url),
    "utf8"
  ).toLowerCase();

  it("redeems at most once per order and never changes totals", () => {
    expect(sql).toContain("idx_loyalty_one_redeemed_transaction_per_order");
    expect(sql).toContain("on conflict (order_id) where type = 'redeemed' and order_id is not null");
    expect(sql).not.toMatch(/set[^;]*\btotal\s*=/);
    expect(sql).not.toMatch(/set[^;]*\bsubtotal\s*=/);
  });

  it("is service-role only and scoped to the restaurant", () => {
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("where id = p_order_id\n    and restaurant_id = p_restaurant_id");
    expect(sql).toContain("where restaurant_id = p_restaurant_id\n    and phone = order_record.customer_phone");
  });
});
