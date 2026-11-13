import { beforeEach, describe, expect, it, vi } from "vitest";

const tables: Record<string, { data: unknown; error: unknown }> = {};
const filters: Record<string, unknown[][]> = {};

function chain(table: string) {
  const record = (...args: unknown[]) => {
    (filters[table] ??= []).push(args);
    return builder;
  };
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (...args: unknown[]) => record("eq", ...args),
    in: (...args: unknown[]) => record("in", ...args),
    or: (...args: unknown[]) => record("or", ...args),
    gte: () => builder,
    order: () => builder,
    limit: () => builder,
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(tables[table]).then(resolve, reject)
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({ from: (table: string) => chain(table) })
}));

const {
  getInWindowRecipients,
  getMarketingAudience,
  hasMarketingConsent,
  MARKETING_FREQUENCY_CAP_MS
} = await import("./store");

const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const consenting = (phone: string) => ({
  phone,
  marketing_opt_in: true,
  consent_marketing: true,
  marketing_consent_withdrawn_at: null
});

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  for (const key of Object.keys(filters)) delete filters[key];
  tables.marketing_sends = { data: [], error: null };
});

describe("hasMarketingConsent", () => {
  const base = consenting("971500000001");
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
        consenting("971500000001"),
        { phone: "971500000002", marketing_opt_in: false, consent_marketing: false, marketing_consent_withdrawn_at: null },
        { ...consenting("971500000003"), marketing_consent_withdrawn_at: recent }
      ],
      error: null
    };

    await expect(getInWindowRecipients("rest-1")).resolves.toEqual([
      { conversationId: "c1", phone: "971500000001" }
    ]);
    expect(filters.customers).toContainEqual(["eq", "restaurant_id", "rest-1"]);
    expect(filters.whatsapp_conversations).toContainEqual(["eq", "restaurant_id", "rest-1"]);
  });

  it("sends to nobody if consent cannot be read", async () => {
    tables.whatsapp_conversations = {
      data: [{ id: "c1", customer_phone: "971500000001", last_inbound_at: recent }],
      error: null
    };
    tables.customers = { data: null, error: { code: "500" } };
    await expect(getInWindowRecipients("rest-1")).resolves.toEqual([]);
    await expect(getMarketingAudience("rest-1")).resolves.toMatchObject({
      readFailed: true
    });
  });
});

describe("frequency cap", () => {
  beforeEach(() => {
    tables.whatsapp_conversations = {
      data: [
        { id: "c1", customer_phone: "971500000001", last_inbound_at: recent },
        { id: "c2", customer_phone: "971500000002", last_inbound_at: recent }
      ],
      error: null
    };
    tables.customers = {
      data: [consenting("971500000001"), consenting("971500000002")],
      error: null
    };
  });

  it("is a 24 hour window", () => {
    expect(MARKETING_FREQUENCY_CAP_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("excludes customers marketed to in the window and counts them", async () => {
    tables.marketing_sends = { data: [{ customer_phone: "971500000002" }], error: null };
    const now = Date.parse("2026-11-13T12:00:00.000Z");
    await expect(getMarketingAudience("rest-1", now)).resolves.toEqual({
      recipients: [{ conversationId: "c1", phone: "971500000001" }],
      frequencyCapped: 1,
      cappedPhones: ["971500000002"]
    });
    // Tenant-scoped, only the consented in-window phones, and `sending`
    // rows (unknown outcome) count as sent.
    expect(filters.marketing_sends).toContainEqual(["eq", "restaurant_id", "rest-1"]);
    expect(filters.marketing_sends).toContainEqual([
      "in",
      "customer_phone",
      ["971500000001", "971500000002"]
    ]);
    expect(filters.marketing_sends).toContainEqual([
      "or",
      "sent_at.gte.2026-11-12T12:00:00.000Z,status.eq.sending"
    ]);
  });

  it("matches what the UI count shows", async () => {
    tables.marketing_sends = { data: [{ customer_phone: "971500000001" }], error: null };
    const audience = await getMarketingAudience("rest-1");
    await expect(getInWindowRecipients("rest-1")).resolves.toEqual(audience.recipients);
  });

  it("sends to nobody if the send log cannot be read", async () => {
    tables.marketing_sends = { data: null, error: { code: "500" } };
    await expect(getMarketingAudience("rest-1")).resolves.toEqual({
      recipients: [],
      frequencyCapped: 0,
      readFailed: true
    });
  });
});
