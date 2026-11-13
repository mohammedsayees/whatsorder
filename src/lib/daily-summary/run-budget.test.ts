import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

const { runWithBudget } = await import("./run");

describe("runWithBudget", () => {
  it("never has more than `concurrency` in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    await runWithBudget([1, 2, 3, 4, 5, 6, 7], 3, () => false, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
    });
    expect(peak).toBe(3);
  });

  it("runs everything when the budget holds", async () => {
    const done: number[] = [];
    const notStarted = await runWithBudget([1, 2, 3], 2, () => false, async (n) => {
      done.push(n);
    });
    expect(notStarted).toBe(0);
    expect(done.sort()).toEqual([1, 2, 3]);
  });

  it("stops starting new work once the budget is spent and reports the rest", async () => {
    const started: number[] = [];
    const notStarted = await runWithBudget(
      [1, 2, 3, 4, 5, 6],
      2,
      () => started.length >= 3,
      async (n) => {
        started.push(n);
      }
    );
    expect(started).toHaveLength(3);
    expect(notStarted).toBe(3);
  });

  it("handles an empty list", async () => {
    expect(await runWithBudget([], 5, () => false, async () => {})).toBe(0);
  });
});
