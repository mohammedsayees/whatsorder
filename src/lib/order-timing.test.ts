import { describe, expect, it } from "vitest";
import { orderTiming } from "./order-timing";
import type { Order } from "./types";
const start = Date.parse("2026-09-07T10:00:00Z");
const order = { status: "Preparing", created_at: new Date(start).toISOString(), status_started_at: new Date(start + 5 * 60000).toISOString() } as Order;
describe("order timers", () => {
  it("uses saved timestamps for independent stage and total clocks", () => {
    expect(orderTiming(order, 20, start + 22 * 60000)).toMatchObject({ minutes: 22, stageMinutes: 17, overdue: 2, tone: "red" });
  });
  it("warns at 80 percent and does not stop for payment", () => {
    expect(orderTiming({ ...order, payment_method: "Card on Delivery" }, 20, start + 16 * 60000)).toMatchObject({ stopped: false, tone: "amber" });
  });
  it("freezes at completion even after unrelated edits", () => {
    expect(orderTiming({ ...order, status: "Completed", closed_at: new Date(start + 25 * 60000).toISOString(), updated_at: new Date(start + 60 * 60000).toISOString() }, 20, start + 120 * 60000)).toMatchObject({ minutes: 25, stopped: true, overdue: 0 });
  });
  it("does not invent historical completion timing", () => {
    expect(orderTiming({ ...order, status: "Cancelled" }, 20, start)).toMatchObject({ minutes: null, stopped: true });
  });
  it("clamps future timestamps and tolerates missing stage history", () => {
    expect(orderTiming({ ...order, status_started_at: null }, 20, start - 60000)).toMatchObject({ minutes: 0, stageMinutes: null });
  });
});
