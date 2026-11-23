import { describe, expect, it } from "vitest";
import {
  calculateChange,
  collectionPlan,
  friendlyRiderActionError,
  parseMoneyAmount,
  parseRiderActionBody,
  planRiderSettlement,
  summarizeRiderLedger
} from "@/lib/rider-cash";

const token = "a".repeat(32);

describe("parseMoneyAmount", () => {
  it("accepts plain amounts with up to two decimals", () => {
    expect(parseMoneyAmount("54")).toBe(54);
    expect(parseMoneyAmount(" 54.5 ")).toBe(54.5);
    expect(parseMoneyAmount(0.1 + 0.2)).toBe(0.3);
  });

  it("rejects anything else", () => {
    for (const bad of ["", "abc", "-5", "1e3", "10.999", "1,5", Number.NaN, Infinity, -1, 100_001, null, undefined]) {
      expect(parseMoneyAmount(bad)).toBeNull();
    }
  });
});

describe("calculateChange", () => {
  it("returns the change without float drift", () => {
    expect(calculateChange(54, 100)).toBe(46);
    expect(calculateChange(19.9, 20)).toBe(0.1);
    expect(calculateChange(54, 54)).toBe(0);
  });

  it("returns null when the customer gave too little", () => {
    expect(calculateChange(54, 50)).toBeNull();
  });
});

describe("collectionPlan", () => {
  it("collects cash and card on delivery", () => {
    expect(collectionPlan({ payment_method: "Cash on Delivery", total: 54 })).toEqual({ kind: "cash", due: 54 });
    expect(collectionPlan({ payment_method: "Card on Delivery", total: 54 })).toEqual({ kind: "card", due: 54 });
  });

  it("never asks the rider to collect prepaid orders", () => {
    expect(collectionPlan({ payment_method: "Online Payment", total: 54, online_payment_status: "paid" })).toMatchObject({
      kind: "none",
      reason: "prepaid"
    });
    expect(collectionPlan({ payment_method: "Customer Credit", total: 54 })).toMatchObject({ kind: "none" });
  });

  it("holds an order whose online payment is not confirmed", () => {
    expect(collectionPlan({ payment_method: "Online Payment", total: 54, online_payment_status: "pending" })).toMatchObject({
      kind: "blocked"
    });
  });

  it("has nothing to collect for a zero total", () => {
    expect(collectionPlan({ payment_method: "Cash on Delivery", total: 0 })).toMatchObject({
      kind: "none",
      reason: "nothing_due"
    });
  });
});

describe("parseRiderActionBody", () => {
  it("accepts the three actions", () => {
    expect(parseRiderActionBody({ token, action: "picked_up" })).toMatchObject({ action: "picked_up" });
    expect(
      parseRiderActionBody({ token, action: "delivered", tenderedAmount: "100", method: "Cash on Delivery" })
    ).toEqual({ token, action: "delivered", tenderedAmount: 100, method: "Cash on Delivery", reason: null });
    expect(parseRiderActionBody({ token, action: "failed", reason: "  No answer " })).toMatchObject({
      reason: "No answer"
    });
  });

  it("rejects unknown actions, bad money, unknown methods and missing reasons", () => {
    expect(parseRiderActionBody(null)).toBeNull();
    expect(parseRiderActionBody({ token, action: "refund" })).toBeNull();
    expect(parseRiderActionBody({ token: 5, action: "delivered" })).toBeNull();
    expect(parseRiderActionBody({ token, action: "delivered", tenderedAmount: "-4" })).toBeNull();
    expect(parseRiderActionBody({ token, action: "delivered", method: "UPI" })).toBeNull();
    expect(parseRiderActionBody({ token, action: "failed" })).toBeNull();
  });

  it("caps the reason length", () => {
    expect(parseRiderActionBody({ token, action: "failed", reason: "x".repeat(500) })?.reason).toHaveLength(200);
  });
});

describe("friendlyRiderActionError", () => {
  it("maps known rule failures and hides everything else", () => {
    expect(friendlyRiderActionError("Cash received is less than the amount due")).toContain("less");
    expect(friendlyRiderActionError("duplicate key value violates unique constraint rider_cash_entries")).toBe(
      "That did not go through. Please try again."
    );
  });
});

describe("summarizeRiderLedger", () => {
  it("is the sum of every entry", () => {
    expect(
      summarizeRiderLedger([
        { entry_type: "float_issued", amount: 100 },
        { entry_type: "change_advance", amount: 50 },
        { entry_type: "order_cash", amount: 54 },
        { entry_type: "order_cash", amount: 19.9 },
        { entry_type: "handover", amount: -150 },
        { entry_type: "variance", amount: -3.9 }
      ])
    ).toEqual({ balance: 70, floatsAndAdvances: 150, orderCash: 73.9, handedOver: 150, variance: -3.9 });
  });

  it("is zero with no entries", () => {
    expect(summarizeRiderLedger([]).balance).toBe(0);
  });
});

describe("planRiderSettlement", () => {
  it("records a partial handover without a difference", () => {
    expect(planRiderSettlement({ balance: 154, handedOver: 100, settleInFull: false })).toEqual({
      entries: [{ entry_type: "handover", amount: -100 }],
      shortfall: 0,
      remaining: 54
    });
  });

  it("settles exactly with no variance entry", () => {
    expect(planRiderSettlement({ balance: 154, handedOver: 154, settleInFull: true })).toEqual({
      entries: [{ entry_type: "handover", amount: -154 }],
      shortfall: 0,
      remaining: 0
    });
  });

  it("records a short rider as a variance that zeroes the balance", () => {
    const plan = planRiderSettlement({ balance: 154, handedOver: 150, settleInFull: true });
    expect(plan?.entries).toEqual([
      { entry_type: "handover", amount: -150 },
      { entry_type: "variance", amount: -4 }
    ]);
    expect(plan?.shortfall).toBe(4);
    expect(plan!.entries.reduce((sum, entry) => sum + entry.amount, 154)).toBe(0);
  });

  it("records extra cash as a positive variance", () => {
    const plan = planRiderSettlement({ balance: 100, handedOver: 120, settleInFull: true });
    expect(plan?.entries).toEqual([
      { entry_type: "handover", amount: -120 },
      { entry_type: "variance", amount: 20 }
    ]);
    expect(plan?.shortfall).toBe(-20);
  });

  it("can settle a rider who handed over nothing", () => {
    expect(planRiderSettlement({ balance: 30, handedOver: 0, settleInFull: true })?.entries).toEqual([
      { entry_type: "variance", amount: -30 }
    ]);
  });

  it("returns null when there is nothing to record", () => {
    expect(planRiderSettlement({ balance: 0, handedOver: 0, settleInFull: true })).toBeNull();
    expect(planRiderSettlement({ balance: 10, handedOver: 0, settleInFull: false })).toBeNull();
    expect(planRiderSettlement({ balance: 10, handedOver: -1, settleInFull: false })).toBeNull();
  });
});
