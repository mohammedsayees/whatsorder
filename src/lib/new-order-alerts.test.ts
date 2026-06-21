import { describe, expect, it } from "vitest";
import { findUnseenOrderIds, rememberOrderIds } from "@/lib/new-order-alerts";

describe("new-order alert reconciliation", () => {
  it("finds orders missed by Realtime without treating seeded orders as new", () => {
    const seen = new Set(["order-1", "order-2"]);

    expect(findUnseenOrderIds(["order-3", "order-2", "order-3"], seen)).toEqual([
      "order-3"
    ]);
  });

  it("keeps the seen-order cache bounded and refreshes recently seen IDs", () => {
    const seen = new Set(["order-1", "order-2", "order-3"]);

    rememberOrderIds(seen, ["order-2", "order-4"], 3);

    expect([...seen]).toEqual(["order-3", "order-2", "order-4"]);
  });
});
