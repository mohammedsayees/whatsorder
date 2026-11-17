import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FUNNEL_EVENTS, buildFunnel, parseFunnelPayload } from "@/lib/customer-funnel";

const restaurantId = "29000000-0000-0000-0000-000000000001";
const sessionId = "abcdefghijklmnop1234";

describe("parseFunnelPayload", () => {
  it("accepts a minimal valid event", () => {
    expect(parseFunnelPayload({ restaurantId, sessionId, event: "menu_view" })).toEqual({
      restaurantId,
      sessionId,
      event: "menu_view"
    });
  });

  it("keeps order, reason and mode when valid", () => {
    expect(
      parseFunnelPayload({
        restaurantId,
        sessionId,
        event: "checkout_blocked",
        detail: "out_of_range",
        fulfilmentType: "delivery",
        orderId: "49000000-0000-4000-8000-00000000000A"
      })
    ).toMatchObject({ detail: "out_of_range", fulfilmentType: "delivery", orderId: "49000000-0000-4000-8000-00000000000a" });
  });

  it.each([
    null,
    [],
    "menu_view",
    { restaurantId: "not-a-uuid", sessionId, event: "menu_view" },
    { restaurantId, sessionId: "short", event: "menu_view" },
    { restaurantId, sessionId, event: "drop_table" },
    { restaurantId, sessionId, event: "checkout_blocked", detail: "Call 0501234567" },
    { restaurantId, sessionId, event: "order_saved", orderId: "123" },
    { restaurantId, sessionId, event: "menu_view", fulfilmentType: "drone" }
  ])("rejects off-spec payloads: %j", (payload) => {
    expect(parseFunnelPayload(payload)).toBeNull();
  });
});

describe("buildFunnel", () => {
  it("orders the main path and computes step-to-step continuation", () => {
    const funnel = buildFunnel([
      { event_name: "checkout_view", sessions: "20" },
      { event_name: "menu_view", sessions: 100 },
      { event_name: "item_added", sessions: 40 },
      { event_name: "order_saved", sessions: 15 },
      { event_name: "search_used", sessions: 12 },
      { event_name: "checkout_blocked", sessions: 3 },
      { event_name: "order_accepted", sessions: 12 }
    ]);
    expect(funnel.steps.map((step) => [step.event, step.sessions, step.continuedPercent])).toEqual([
      ["menu_view", 100, null],
      ["item_added", 40, 40],
      ["checkout_view", 20, 50],
      ["order_saved", 15, 75],
      ["whatsapp_opened", 0, 0],
      ["order_accepted", 12, 80]
    ]);
    expect(funnel.searchSessions).toBe(12);
    expect(funnel.blockedSessions).toBe(3);
  });

  it("never divides by zero", () => {
    expect(buildFunnel([]).steps.every((step) => step.continuedPercent === null)).toBe(true);
  });
});

describe("migration contract", () => {
  it("allows exactly the events the app sends", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20261119090000_customer_funnel_events.sql"),
      "utf8"
    );
    for (const event of FUNNEL_EVENTS) {
      expect(sql).toContain(`'${event}'`);
    }
  });
});
