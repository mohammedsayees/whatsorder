import { describe, expect, it, vi } from "vitest";

const tables: Record<string, { data: unknown; error: unknown }> = {};
const customerFilters: unknown[][] = [];

function chain(table: string) {
  const result = () => tables[table];
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (...args: unknown[]) => {
      if (table === "customers") customerFilters.push(["eq", ...args]);
      return builder;
    },
    gte: () => builder,
    order: () => builder,
    limit: () => Promise.resolve(result()),
    in: () => Promise.resolve(result())
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({ from: (table: string) => chain(table) })
}));

const { getInWindowRecipients, hasMarketingConsent } = await import("./store");

const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();

describe("hasMarketingConsent", () => {
  const base = {
    phone: "971500000001",
    marketing_opt_in: true,
    consent_marketing: true,
    marketing_consent_withdrawn_at: null
  };
  it("requires opt-in, consent and no withdrawal", () => {
    expect(hasMarketingConsent(base)).toBe(true);
    expect(hasMarketingConsent({ ...base, marketing_opt_in: false })).toBe(false);
    expect(hasMarketingConsent({ ...base, consent_marketing: null })).toBe(false);
    expect(
      hasMarketingConsent({ ...base, marketing_consent_withdrawn_at: recent })
    ).toBe(false);
  });
});

describe("getInWindowRecipients", () => {
  it("keeps only in-window customers of this restaurant who consented", async () => {
    tables.whatsapp_conversations = {
      data: [
        { id: "c1", customer_phone: "971500000001", last_inbound_at: recent },
        { id: "c2", customer_phone: "971500000002", last_inbound_at: recent },
        { id: "c3", customer_phone: "971500000003", last_inbound_at: recent },
        { id: "c4", customer_phone: "971500000004", last_inbound_at: recent }
      ],
      error: null
    };
    tables.customers = {
      data: [
        { phone: "971500000001", marketing_opt_in: true, consent_marketing: true, marketing_consent_withdrawn_at: null },
        { phone: "971500000002", marketing_opt_in: false, consent_marketing: false, marketing_consent_withdrawn_at: null },
        { phone: "971500000003", marketing_opt_in: true, consent_marketing: true, marketing_consent_withdrawn_at: recent }
      ],
      error: null
    };

    await expect(getInWindowRecipients("rest-1")).resolves.toEqual([
      { conversationId: "c1", phone: "971500000001" }
    ]);
    expect(customerFilters).toContainEqual(["eq", "restaurant_id", "rest-1"]);
  });

  it("sends to nobody if consent cannot be read", async () => {
    tables.whatsapp_conversations = {
      data: [{ id: "c1", customer_phone: "971500000001", last_inbound_at: recent }],
      error: null
    };
    tables.customers = { data: null, error: { code: "500" } };
    await expect(getInWindowRecipients("rest-1")).resolves.toEqual([]);
  });
});
