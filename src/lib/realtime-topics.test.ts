import { describe, expect, it } from "vitest";
import {
  parseConversationBroadcast,
  parseMessageBroadcast,
  parseOrderBroadcast,
  privateChannelConfig,
  restaurantChatsTopic,
  restaurantOrdersTopic
} from "./realtime-topics";

const restaurantId = "00000000-0000-4000-8000-000000000001";

describe("realtime topics", () => {
  it("matches the topic format the database policy accepts", () => {
    const policyPattern =
      /^restaurant:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(orders|chats)$/;
    expect(restaurantOrdersTopic(restaurantId)).toMatch(policyPattern);
    expect(restaurantChatsTopic(restaurantId)).toMatch(policyPattern);
  });

  it("always requests a private channel", () => {
    expect(privateChannelConfig.config.private).toBe(true);
  });
});

describe("broadcast payload parsing", () => {
  it("reads order events and tolerates missing optional fields", () => {
    expect(
      parseOrderBroadcast({
        id: "o1",
        status: "New",
        fulfilment_type: "car_pickup",
        customer_arrived_at: "2026-11-20T10:00:00Z",
        online_payment_status: null
      })
    ).toEqual({
      id: "o1",
      status: "New",
      fulfilment_type: "car_pickup",
      customer_arrived_at: "2026-11-20T10:00:00Z",
      online_payment_status: null
    });
    expect(parseOrderBroadcast({ id: "o2", status: "New" })?.customer_arrived_at).toBeNull();
  });

  it("rejects malformed payloads", () => {
    expect(parseOrderBroadcast(null)).toBeNull();
    expect(parseOrderBroadcast({ status: "New" })).toBeNull();
    expect(parseOrderBroadcast([])).toBeNull();
    expect(parseConversationBroadcast({ id: "c1" })).toBeNull();
    expect(parseConversationBroadcast({ id: "c1", unread_count: null })).toBeNull();
    expect(parseConversationBroadcast({ id: "c1", unread_count: "x" })).toBeNull();
    expect(parseMessageBroadcast({ id: "m1" })).toBeNull();
  });

  it("reads conversation and message events", () => {
    expect(parseConversationBroadcast({ id: "c1", unread_count: 0 })).toEqual({
      id: "c1",
      unread_count: 0
    });
    expect(
      parseMessageBroadcast({ id: "m1", conversation_id: "c1", direction: "inbound" })
    ).toEqual({ id: "m1", conversation_id: "c1", direction: "inbound" });
  });
});
