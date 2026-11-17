import { describe, expect, it } from "vitest";
import {
  MIN_PREP_SAMPLES,
  computePrepEstimate,
  prepRangeLabel,
  type PrepEvent
} from "@/lib/prep-time";

const base = Date.parse("2026-11-10T08:00:00Z");
const at = (minutes: number) => new Date(base + minutes * 60_000).toISOString();

function timedOrder(id: string, prepMinutes: number, ready: PrepEvent["to_status"] = "Ready to Serve") {
  return [
    { order_id: id, to_status: "Accepted" as const, created_at: at(0) },
    { order_id: id, to_status: "Preparing" as const, created_at: at(1) },
    { order_id: id, to_status: ready, created_at: at(prepMinutes) }
  ];
}

describe("computePrepEstimate", () => {
  it("returns null until there are enough timed orders", () => {
    const events = Array.from({ length: MIN_PREP_SAMPLES - 1 }, (_, i) => timedOrder(`o${i}`, 10)).flat();
    expect(computePrepEstimate(events)).toBeNull();
  });

  it("uses the median of accepted -> ready, including out-for-delivery", () => {
    const minutes = [4, 6, 8, 10, 12, 14, 16, 60];
    const events = minutes.flatMap((m, i) =>
      timedOrder(`o${i}`, m, i % 2 ? "Out for Delivery" : "Ready to Serve")
    );
    expect(computePrepEstimate(events)).toEqual({ minutes: 11, samples: 8 });
  });

  it("skips orders without both ends, out-of-order times and outliers", () => {
    const good = Array.from({ length: MIN_PREP_SAMPLES }, (_, i) => timedOrder(`g${i}`, 9)).flat();
    const noise: PrepEvent[] = [
      { order_id: "never-ready", to_status: "Accepted", created_at: at(0) },
      { order_id: "never-accepted", to_status: "Ready to Serve", created_at: at(5) },
      ...timedOrder("seconds", 0.2),
      ...timedOrder("left-open", 400),
      { order_id: "backwards", to_status: "Accepted", created_at: at(10) },
      { order_id: "backwards", to_status: "Ready to Serve", created_at: at(5) },
      { order_id: "bad-date", to_status: "Accepted", created_at: "nope" }
    ];
    expect(computePrepEstimate([...good, ...noise])).toEqual({ minutes: 9, samples: MIN_PREP_SAMPLES });
  });

  it("uses the first acceptance and first ready when statuses repeat", () => {
    const events = Array.from({ length: MIN_PREP_SAMPLES }, (_, i) => [
      { order_id: `r${i}`, to_status: "Accepted" as const, created_at: at(2) },
      { order_id: `r${i}`, to_status: "Accepted" as const, created_at: at(0) },
      { order_id: `r${i}`, to_status: "Ready to Serve" as const, created_at: at(20) },
      { order_id: `r${i}`, to_status: "Ready to Serve" as const, created_at: at(12) }
    ]).flat();
    expect(computePrepEstimate(events)?.minutes).toBe(12);
  });
});

describe("prepRangeLabel", () => {
  it("gives short, honest ranges", () => {
    expect(prepRangeLabel(2)).toBe("3–5");
    expect(prepRangeLabel(7)).toBe("5–9");
    expect(prepRangeLabel(10)).toBe("8–12");
    expect(prepRangeLabel(12)).toBe("10–15");
    expect(prepRangeLabel(25)).toBe("25–30");
  });
});
