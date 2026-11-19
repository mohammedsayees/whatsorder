import { describe, expect, it } from "vitest";
import {
  asOnlinePaymentStatus,
  checkoutSessionOutcome,
  onlinePaymentStaffLabel,
  toMinorUnits
} from "@/lib/stripe/order-payment-rules";

describe("online order payment rules", () => {
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
