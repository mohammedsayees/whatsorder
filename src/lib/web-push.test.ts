import { describe, expect, it } from "vitest";
import { buildOrderPushPayload } from "./web-push";

describe("buildOrderPushPayload", () => {
  const base = {
    orderId: "00000000-0000-4000-8000-0000abcd1234",
    restaurantName: "Chai Xpress",
    restaurantSlug: "chai xpress"
  };

  it("builds minimal, non-PII payloads for customer-facing status changes", () => {
    for (const status of [
      "Accepted",
      "Ready to Serve",
      "Out for Delivery",
      "Completed",
      "Cancelled"
    ] as const) {
      const payload = buildOrderPushPayload({ ...base, status });
      expect(payload).not.toBeNull();
      expect(payload?.title).toContain("Chai Xpress");
      expect(payload?.body).toContain("ABCD1234");
      expect(payload?.url).toBe("/r/chai%20xpress");
      expect(JSON.stringify(payload)).not.toContain("customer");
    }
  });

  it("does not notify for New or Preparing", () => {
    expect(buildOrderPushPayload({ ...base, status: "New" })).toBeNull();
    expect(buildOrderPushPayload({ ...base, status: "Preparing" })).toBeNull();
  });
});
