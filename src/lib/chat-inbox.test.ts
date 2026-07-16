import { describe, expect, it } from "vitest";
import {
  chatMessagePreview,
  isChatConversationFilter,
  isWithinServiceWindow,
  SERVICE_WINDOW_MS,
  serviceWindowRemainingMs
} from "@/lib/chat-inbox";

const NOW = Date.parse("2026-07-16T12:00:00Z");

describe("serviceWindowRemainingMs", () => {
  it("returns 0 when no inbound message has ever opened a window", () => {
    expect(serviceWindowRemainingMs(null, NOW)).toBe(0);
  });

  it("returns 0 for an unparseable timestamp", () => {
    expect(serviceWindowRemainingMs("not-a-date", NOW)).toBe(0);
  });

  it("returns the remaining time inside the window", () => {
    const opened = new Date(NOW - 6 * 60 * 60 * 1000).toISOString();
    expect(serviceWindowRemainingMs(opened, NOW)).toBe(
      SERVICE_WINDOW_MS - 6 * 60 * 60 * 1000
    );
  });

  it("returns 0 once the 24h window has expired", () => {
    const opened = new Date(NOW - SERVICE_WINDOW_MS - 1).toISOString();
    expect(serviceWindowRemainingMs(opened, NOW)).toBe(0);
  });

  it("treats the exact 24h boundary as expired", () => {
    const opened = new Date(NOW - SERVICE_WINDOW_MS).toISOString();
    expect(isWithinServiceWindow(opened, NOW)).toBe(false);
  });

  it("is open just inside the boundary", () => {
    const opened = new Date(NOW - SERVICE_WINDOW_MS + 1000).toISOString();
    expect(isWithinServiceWindow(opened, NOW)).toBe(true);
  });
});

describe("chatMessagePreview", () => {
  it("collapses whitespace in text messages", () => {
    expect(chatMessagePreview("text", "  hello\n\nthere  ")).toBe("hello there");
  });

  it("truncates long text with an ellipsis", () => {
    const preview = chatMessagePreview("text", "a".repeat(300));
    expect(preview.length).toBe(120);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("uses a type placeholder for non-text messages", () => {
    expect(chatMessagePreview("image", "")).toBe("[image]");
    expect(chatMessagePreview("audio", "")).toBe("[audio]");
  });
});

describe("isChatConversationFilter", () => {
  it("accepts the known filters", () => {
    expect(isChatConversationFilter("open")).toBe(true);
    expect(isChatConversationFilter("closed")).toBe(true);
    expect(isChatConversationFilter("unread")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isChatConversationFilter("all")).toBe(false);
    expect(isChatConversationFilter(undefined)).toBe(false);
    expect(isChatConversationFilter("delete * from")).toBe(false);
  });
});
