import { describe, expect, it } from "vitest";
import { updateUnreadConversationIds } from "@/lib/chat-unread";

describe("updateUnreadConversationIds", () => {
  it("adds a newly unread conversation once", () => {
    expect(updateUnreadConversationIds(["chat-1"], {
      id: "chat-2",
      unread_count: 3
    })).toEqual(["chat-1", "chat-2"]);
    expect(updateUnreadConversationIds(["chat-1"], {
      id: "chat-1",
      unread_count: 2
    })).toEqual(["chat-1"]);
  });

  it("removes a conversation when its shared unread count is cleared", () => {
    expect(updateUnreadConversationIds(["chat-1", "chat-2"], {
      id: "chat-1",
      unread_count: 0
    })).toEqual(["chat-2"]);
  });
});
