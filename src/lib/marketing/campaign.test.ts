import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data", () => ({ getCustomerSegments: vi.fn() }));
vi.mock("@/lib/poster/store", () => ({ getMarketingAudience: vi.fn() }));

const { breakdownCampaign, CAMPAIGN_CHANNELS } = await import("./campaign");
const { runMarketingSend } = await import("./send-pipeline");

const consented = { marketing_opt_in: true, consent_marketing: true, marketing_consent_withdrawn_at: null };
const member = (phone: string, consent = true) => ({ phone, ...(consent ? consented : { marketing_opt_in: false, consent_marketing: false }) });

describe("breakdownCampaign", () => {
  it("explains every member: reachable, not opted in, no window, capped", () => {
    const result = breakdownCampaign(
      [member("1"), member("2"), member("3"), member("4", false), member("5")],
      {
        recipients: [
          { phone: "1", conversationId: "c1" },
          { phone: "9", conversationId: "c9" } // in window but not in this segment
        ],
        cappedPhones: ["2", "8"]
      }
    );
    expect(result.segmentSize).toBe(5);
    expect(result.reachable).toEqual([{ phone: "1", conversationId: "c1" }]);
    expect(result.notOptedIn).toBe(1);
    expect(result.frequencyCapped).toBe(1);
    expect(result.noOpenWindow).toBe(2); // 3 and 5
    expect(result.reachable.length + result.notOptedIn + result.frequencyCapped + result.noOpenWindow).toBe(5);
  });

  it("never treats a missing consent flag as consent", () => {
    const result = breakdownCampaign([{ phone: "1" }], { recipients: [{ phone: "1", conversationId: "c" }] });
    expect(result.reachable).toEqual([]);
    expect(result.notOptedIn).toBe(1);
  });
});

describe("campaign channels", () => {
  it("only the free in-window channel is live; paid templates are a declared seam", () => {
    expect(CAMPAIGN_CHANNELS.service_window.available).toBe(true);
    expect(CAMPAIGN_CHANNELS.template.available).toBe(false);
  });
});

describe("send pipeline scope", () => {
  it("leaves rows outside a campaign's segment untouched", async () => {
    const rows = [
      { id: "a", customer_phone: "1", conversation_id: "c1", status: "queued" as const },
      { id: "b", customer_phone: "2", conversation_id: "c2", status: "queued" as const }
    ];
    const skipped: string[][] = [];
    const sent: string[] = [];
    const result = await runMarketingSend({
      store: {
        queue: async () => true,
        listForPoster: async () => rows,
        claim: async () => true,
        markSent: async (id) => void sent.push(id),
        markFailed: async () => undefined,
        markSkipped: async (ids) => void skipped.push(ids)
      },
      recipients: [{ phone: "1", conversationId: "c1" }],
      caption: "c",
      scope: (phone) => phone === "1",
      prepareSender: async () => async () => "wamid"
    });
    expect(sent).toEqual(["a"]);
    // Row b (another segment's queued customer) is neither sent nor skipped.
    expect(skipped).toEqual([]);
    expect(result).toMatchObject({ sent: 1, skipped: 0 });
  });
});
