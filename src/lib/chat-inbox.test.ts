import { describe, expect, it } from "vitest";
import {
  chatMessagePreview,
  isChatConversationFilter,
  isChatAutomationActive,
  isWithinServiceWindow,
  maskCustomerLinkToken,
  SERVICE_WINDOW_MS,
  serviceWindowRemainingMs,
  shouldUpgradeChatStatus
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

  it("appends the caption to media placeholders", () => {
    expect(chatMessagePreview("image", "our new menu")).toBe(
      "[image] our new menu"
    );
    expect(chatMessagePreview("document", "menu.pdf")).toBe(
      "[document] menu.pdf"
    );
  });
});

describe("maskCustomerLinkToken", () => {
  it("redacts the token query param but keeps the rest of the link", () => {
    const body =
      "View your order →\nhttps://x.app/api/customer/link?token=eyJhbGciOi.abc_d-ef&next=%2Fr%2Fchaixpress";
    expect(maskCustomerLinkToken(body)).toBe(
      "View your order →\nhttps://x.app/api/customer/link?token=•••&next=%2Fr%2Fchaixpress"
    );
  });

  it("redacts a trailing token with no following param", () => {
    expect(maskCustomerLinkToken("https://x.app/link?token=abc123")).toBe(
      "https://x.app/link?token=•••"
    );
  });

  it("leaves token-free messages untouched", () => {
    expect(maskCustomerLinkToken("hello there")).toBe("hello there");
  });
});

describe("shouldUpgradeChatStatus", () => {
  it("moves forward from null through sent/delivered/read", () => {
    expect(shouldUpgradeChatStatus(null, "sent")).toBe(true);
    expect(shouldUpgradeChatStatus("sent", "delivered")).toBe(true);
    expect(shouldUpgradeChatStatus("delivered", "read")).toBe(true);
  });

  it("never downgrades on out-of-order webhook deliveries", () => {
    expect(shouldUpgradeChatStatus("read", "delivered")).toBe(false);
    expect(shouldUpgradeChatStatus("delivered", "sent")).toBe(false);
    expect(shouldUpgradeChatStatus("read", "read")).toBe(false);
  });

  it("ignores unknown statuses", () => {
    expect(shouldUpgradeChatStatus("sent", "bogus")).toBe(false);
  });

  it("treats failed as terminal-forward", () => {
    expect(shouldUpgradeChatStatus("sent", "failed")).toBe(true);
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

describe("isChatAutomationActive", () => {
  it("allows active and expired-pause conversations", () => {
    expect(
      isChatAutomationActive({
        automation_state: "active",
        automation_paused_until: null
      })
    ).toBe(true);
    expect(
      isChatAutomationActive(
        {
          automation_state: "paused",
          automation_paused_until: "2026-07-23T00:00:00.000Z"
        },
        Date.parse("2026-07-23T01:00:00.000Z")
      )
    ).toBe(true);
  });

  it("blocks indefinite and current pauses", () => {
    expect(
      isChatAutomationActive({
        automation_state: "paused",
        automation_paused_until: null
      })
    ).toBe(false);
    expect(
      isChatAutomationActive(
        {
          automation_state: "paused",
          automation_paused_until: "2026-07-23T02:00:00.000Z"
        },
        Date.parse("2026-07-23T01:00:00.000Z")
      )
    ).toBe(false);
  });
});
