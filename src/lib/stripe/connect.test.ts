import { describe, expect, it } from "vitest";
import {
  canAcceptOnlinePayments,
  cardPaymentsStatusOf,
  requirementsDueOf,
  stripeDashboardUrl,
  supportsOnlinePayments
} from "@/lib/stripe/connect";

describe("Stripe Connect rules", () => {
  it("offers online payments to UAE restaurants only for now", () => {
    expect(supportsOnlinePayments("AE")).toBe(true);
    expect(supportsOnlinePayments("ae")).toBe(true);
    expect(supportsOnlinePayments("IN")).toBe(false);
    expect(supportsOnlinePayments(null)).toBe(false);
  });

  it("reads the v2 card_payments capability status", () => {
    const account = (status?: string) => ({
      configuration: { merchant: { capabilities: { card_payments: { status } } } }
    });
    expect(cardPaymentsStatusOf(account("active"))).toBe("active");
    expect(cardPaymentsStatusOf(account("restricted"))).toBe("restricted");
    expect(cardPaymentsStatusOf(account("something_new"))).toBe("pending");
    expect(cardPaymentsStatusOf({})).toBe("pending");
  });

  it("flags requirements that need the restaurant's attention", () => {
    const withDeadline = (status: string) => ({ requirements: { summary: { minimum_deadline: { status } } } });
    expect(requirementsDueOf(withDeadline("past_due"))).toBe(true);
    expect(requirementsDueOf(withDeadline("currently_due"))).toBe(true);
    expect(requirementsDueOf(withDeadline("eventually_due"))).toBe(false);
    expect(requirementsDueOf({})).toBe(false);
  });

  it("only allows online payments once cards are active", () => {
    expect(canAcceptOnlinePayments({ card_payments_status: "active" })).toBe(true);
    expect(canAcceptOnlinePayments({ card_payments_status: "pending" })).toBe(false);
    expect(canAcceptOnlinePayments(null)).toBe(false);
  });

  it("links to the restaurant's own Stripe Dashboard", () => {
    expect(stripeDashboardUrl("acct_123")).toBe("https://dashboard.stripe.com/acct_123");
  });
});
