import { describe, expect, it } from "vitest";
import {
  asOnlinePaymentStatus,
  checkoutSessionOutcome,
  meetsOnlinePaymentMinimum,
  onlinePaymentMinimum,
  onlinePaymentStaffLabel,
  toMinorUnits
} from "@/lib/stripe/order-payment-rules";

describe("online order payment rules", () => {
  it("knows Stripe's minimum charge (AED 2.00)", () => {
    expect(onlinePaymentMinimum("AED")).toBe(2);
    expect(onlinePaymentMinimum("aed")).toBe(2);
    expect(onlinePaymentMinimum(null)).toBe(2);
    expect(meetsOnlinePaymentMinimum(1, "AED")).toBe(false);
    expect(meetsOnlinePaymentMinimum(1.99, "AED")).toBe(false);
    expect(meetsOnlinePaymentMinimum(2, "AED")).toBe(true);
    expect(meetsOnlinePaymentMinimum(0.1 + 1.9, "AED")).toBe(true);
    expect(meetsOnlinePaymentMinimum(0, "XYZ")).toBe(false);
    expect(meetsOnlinePaymentMinimum(0.01, "XYZ")).toBe(true);
  });

  it("charges the order total in fils without float drift", () => {
    expect(toMinorUnits(18)).toBe(1800);
    expect(toMinorUnits(12.35)).toBe(1235);
    expect(toMinorUnits(0.1 + 0.2)).toBe(30);
    expect(toMinorUnits(Number.NaN)).toBe(0);
  });

  it("treats only a completed, paid session as paid", () => {
    expect(checkoutSessionOutcome({ status: "complete", payment_status: "paid" })).toBe("paid");
    // Delayed methods complete before the money arrives.
    expect(checkoutSessionOutcome({ status: "complete", payment_status: "unpaid" })).toBeNull();
    expect(checkoutSessionOutcome({ status: "open", payment_status: "unpaid" })).toBeNull();
    expect(checkoutSessionOutcome({ status: "expired", payment_status: "unpaid" })).toBe("expired");
  });

  it("labels online states for staff", () => {
    expect(onlinePaymentStaffLabel("paid")).toBe("Paid online");
    expect(onlinePaymentStaffLabel("pending")).toBe("Awaiting online payment");
    expect(onlinePaymentStaffLabel(null)).toBeNull();
    expect(asOnlinePaymentStatus("captured")).toBeNull();
    expect(asOnlinePaymentStatus("refunded")).toBe("refunded");
  });
});
