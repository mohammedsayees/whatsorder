import { describe, expect, it } from "vitest";
import { outboxResultUpdate, queuedRetryUpdate } from "./outbox-retry";

describe("offline replay recovery", () => {
  it("keeps an uncertain save queued without changing its payload or id", () => {
    expect(outboxResultUpdate({ error: "Previous attempt could not be checked", retryUnchanged: true }, 0, 100))
      .toEqual({ status: "queued", attempts: 1, lastError: "Previous attempt could not be checked", nextAttemptAt: 20100 });
  });
  it("requires saved-order acknowledgement before removing a bill", () => {
    expect(outboxResultUpdate({}, 0, 0)?.status).toBe("queued");
    expect(outboxResultUpdate({ order: { id: "saved-id" } }, 0)).toBeNull();
  });
  it("parks actionable rejections instead of hammering the server", () => {
    expect(outboxResultUpdate({ error: "Item no longer available" }, 3)?.status).toBe("failed");
  });
  it("backs off across attempts but continues recovery after long outages", () => {
    expect(queuedRetryUpdate(1, "offline", 100).nextAttemptAt).toBe(40100);
    expect(queuedRetryUpdate(100, "offline", 100).nextAttemptAt).toBe(300100);
    expect(queuedRetryUpdate(100, "offline").status).toBe("queued");
  });
});
