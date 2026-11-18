import { describe, expect, it } from "vitest";
import { summarizeCashVariance } from "@/lib/shift-variance";

const shift = (user: string, cash: number | null, card: number | null = 0) => ({
  opened_by_user_id: user,
  difference_amount: cash,
  card_difference_amount: card
});

describe("summarizeCashVariance", () => {
  it("totals shorts, overs and balanced shifts per opener", () => {
    const [row] = summarizeCashVariance([
      shift("a", -5),
      shift("a", -12.5),
      shift("a", 3),
      shift("a", 0),
      shift("a", 0.004), // within tolerance
      shift("a", null, -2) // legacy shift without a difference
    ]);
    expect(row).toEqual({
      userId: "a",
      shiftCount: 6,
      balancedCount: 3,
      shortCount: 2,
      shortTotal: 17.5,
      overCount: 1,
      overTotal: 3,
      net: -14.5,
      largestShort: 12.5,
      cardMismatchCount: 1
    });
  });

  it("puts the most money missing first, and keeps cents exact", () => {
    const rows = summarizeCashVariance([
      shift("small", -0.1),
      shift("small", -0.2),
      shift("big", -50),
      shift("clean", 0)
    ]);
    expect(rows.map((row) => row.userId)).toEqual(["big", "small", "clean"]);
    expect(rows[1].shortTotal).toBe(0.3);
  });

  it("returns nothing for no shifts", () => {
    expect(summarizeCashVariance([])).toEqual([]);
  });
});
