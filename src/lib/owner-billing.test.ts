import { describe, expect, it } from "vitest";
import {
  BANK_DETAILS_MISSING_MESSAGE,
  amountDue,
  buildPaymentReceiptMessage,
  buildTrialConversionPreview,
  canViewBilling,
  daysBetween,
  firstInvoiceSentence,
  formatBillingAmount,
  formatBillingDate,
  isInvoiceOverdue,
  isInvoiceUnpaid,
  isUuid,
  readBankTransferDetails,
  shouldShowTrialNotice,
  sortInvoicesNewestFirst,
  trialConversionDate,
  trialEndHeadline,
  trialPlanSentence
} from "@/lib/owner-billing";

// Intl separates the currency code with a no-break space; compare plain text.
const plain = (value: string) => value.replace(/\u00a0/g, " ");

const growth = { name: "Growth", monthly_price: 299, annual_price: 2990, currency: "AED" };

function trialing(overrides: Partial<{
  trial_ends_at: string | null;
  billing_interval: "monthly" | "yearly";
  price_override: number | null;
  price_override_ends_at: string | null;
  status: "trialing" | "active";
}> = {}) {
  return {
    status: "trialing" as const,
    trial_ends_at: "2026-11-18T00:00:00.000Z",
    billing_interval: "monthly" as const,
    price_override: null,
    price_override_ends_at: null,
    ...overrides
  };
}

describe("trial conversion date", () => {
  it("converts on the trial end date when it ends at midnight UTC (assignPlan default)", () => {
    expect(trialConversionDate("2026-11-18T00:00:00.000Z")).toBe("2026-11-18");
  });

  it("waits for the next 03:00 UTC cron run when the trial ends later in the day", () => {
    expect(trialConversionDate("2026-11-18T03:00:00.000Z")).toBe("2026-11-18");
    expect(trialConversionDate("2026-11-18T10:00:00.000Z")).toBe("2026-11-19");
  });
});

describe("monthly trial preview", () => {
  const preview = buildTrialConversionPreview({
    subscription: trialing(),
    plan: growth,
    today: "2026-11-14"
  })!;

  it("keeps the rest of the conversion month free and invoices on the next 1st", () => {
    expect(preview.trialEndDate).toBe("2026-11-18");
    expect(preview.daysLeft).toBe(4);
    expect(preview.freeUntil).toBe("2026-11-30");
    expect(preview.firstInvoice).toEqual({
      issueDate: "2026-12-01",
      dueDate: "2026-12-08",
      periodStart: "2026-12-01",
      periodEnd: "2026-12-31"
    });
    expect(preview.price).toBe(299);
  });

  it("describes the first invoice accurately", () => {
    expect(trialEndHeadline(preview)).toBe("Your free trial ends on 18 Nov 2026, in 4 days");
    expect(plain(trialPlanSentence(preview))).toBe(
      "You will move to the Growth plan at AED 299 a month."
    );
    expect(plain(firstInvoiceSentence(preview))).toBe(
      "The days to 30 Nov 2026 are free. Your first invoice, AED 299 for December 2026, is issued on 1 Dec 2026 and is due by 8 Dec 2026."
    );
  });

  it("gives a trial ending on the 1st the whole month free", () => {
    const first = buildTrialConversionPreview({
      subscription: trialing({ trial_ends_at: "2026-12-01T00:00:00.000Z" }),
      plan: growth,
      today: "2026-11-25"
    })!;
    expect(first.freeUntil).toBe("2026-12-31");
    expect(first.firstInvoice.issueDate).toBe("2027-01-01");
    expect(first.firstInvoice.periodEnd).toBe("2027-01-31");
  });

  it("moves the cycle with a trial the cron has not converted yet", () => {
    const late = buildTrialConversionPreview({
      subscription: trialing({ trial_ends_at: "2026-11-30T00:00:00.000Z" }),
      plan: growth,
      today: "2026-12-02"
    })!;
    expect(late.daysLeft).toBe(-2);
    expect(late.conversionDate).toBe("2026-12-02");
    expect(late.freeUntil).toBe("2026-12-31");
    expect(late.firstInvoice.issueDate).toBe("2027-01-01");
    expect(trialEndHeadline(late)).toBe("Your free trial ended on 30 Nov 2026");
  });

  it("prices the first invoice on its issue date, respecting overrides", () => {
    const discounted = buildTrialConversionPreview({
      subscription: trialing({ price_override: 199, price_override_ends_at: null }),
      plan: growth,
      today: "2026-11-14"
    })!;
    expect(discounted.price).toBe(199);

    const expiring = buildTrialConversionPreview({
      subscription: trialing({ price_override: 199, price_override_ends_at: "2026-11-30" }),
      plan: growth,
      today: "2026-11-14"
    })!;
    // The discount ends before the 1 Dec issue date, so list price applies.
    expect(expiring.price).toBe(299);
  });
});

describe("yearly trial preview", () => {
  const preview = buildTrialConversionPreview({
    subscription: trialing({ billing_interval: "yearly" }),
    plan: growth,
    today: "2026-11-14"
  })!;

  it("invoices a full year at trial end", () => {
    expect(preview.freeUntil).toBeNull();
    expect(preview.price).toBe(2990);
    expect(preview.firstInvoice).toEqual({
      issueDate: "2026-11-18",
      dueDate: "2026-11-25",
      periodStart: "2026-11-18",
      periodEnd: "2027-11-17"
    });
  });

  it("describes the first invoice accurately", () => {
    expect(plain(trialPlanSentence(preview))).toBe(
      "You will move to the Growth plan at AED 2,990 a year."
    );
    expect(plain(firstInvoiceSentence(preview))).toBe(
      "Your first invoice, AED 2,990 for 18 Nov 2026 to 17 Nov 2027, is issued when your trial converts on 18 Nov 2026 and is due by 25 Nov 2026."
    );
  });

  it("keeps the year anchored on the trial end date when conversion runs a day later", () => {
    const late = buildTrialConversionPreview({
      subscription: trialing({
        billing_interval: "yearly",
        trial_ends_at: "2026-11-18T10:00:00.000Z"
      }),
      plan: growth,
      today: "2026-11-14"
    })!;
    expect(late.firstInvoice.issueDate).toBe("2026-11-19");
    expect(late.firstInvoice.periodStart).toBe("2026-11-18");
  });
});

describe("trial notice window", () => {
  const at = (today: string) =>
    buildTrialConversionPreview({ subscription: trialing(), plan: growth, today });

  it("shows only during the last 7 days", () => {
    expect(shouldShowTrialNotice(at("2026-11-10"))).toBe(false); // 8 days left
    expect(shouldShowTrialNotice(at("2026-11-11"))).toBe(true); // 7 days left
    expect(shouldShowTrialNotice(at("2026-11-18"))).toBe(true); // ends today
  });

  it("uses today / tomorrow wording", () => {
    expect(trialEndHeadline(at("2026-11-18")!)).toBe("Your free trial ends today (18 Nov 2026)");
    expect(trialEndHeadline(at("2026-11-17")!)).toBe("Your free trial ends tomorrow (18 Nov 2026)");
  });

  it("is absent outside a trial or without an end date", () => {
    expect(
      buildTrialConversionPreview({
        subscription: trialing({ status: "active" }),
        plan: growth,
        today: "2026-11-14"
      })
    ).toBeNull();
    expect(
      buildTrialConversionPreview({
        subscription: trialing({ trial_ends_at: null }),
        plan: growth,
        today: "2026-11-14"
      })
    ).toBeNull();
    expect(shouldShowTrialNotice(null)).toBe(false);
  });
});

describe("bank transfer details", () => {
  it("needs all three values", () => {
    expect(readBankTransferDetails({})).toBeNull();
    expect(
      readBankTransferDetails({
        WHATSORDER_BANK_ACCOUNT_NAME: "Whatsorder",
        WHATSORDER_BANK_NAME: "  ",
        WHATSORDER_BANK_IBAN: "AE07 0331 2345 6789 0123 456"
      })
    ).toBeNull();
    expect(BANK_DETAILS_MISSING_MESSAGE).toBe("Contact WhatsOrder support for payment details");
  });

  it("trims and normalises the IBAN", () => {
    expect(
      readBankTransferDetails({
        WHATSORDER_BANK_ACCOUNT_NAME: " Whatsorder ",
        WHATSORDER_BANK_NAME: "Example Bank",
        WHATSORDER_BANK_IBAN: "ae07  0331 2345"
      })
    ).toEqual({ accountName: "Whatsorder", bankName: "Example Bank", iban: "AE07 0331 2345" });
  });
});

describe("invoice helpers", () => {
  const issued = { status: "issued" as const, total: 299, paid_to_date: 0, due_at: "2026-12-08T00:00:00.000Z" };

  it("treats only issued, not fully paid invoices as unpaid", () => {
    expect(isInvoiceUnpaid(issued)).toBe(true);
    expect(isInvoiceUnpaid({ ...issued, paid_to_date: 299 })).toBe(false);
    expect(isInvoiceUnpaid({ ...issued, status: "paid" })).toBe(false);
    expect(isInvoiceUnpaid({ ...issued, status: "void" })).toBe(false);
    expect(amountDue({ ...issued, paid_to_date: 100.1 })).toBe(198.9);
    expect(amountDue({ ...issued, paid_to_date: 400 })).toBe(0);
  });

  it("flags overdue unpaid invoices", () => {
    expect(isInvoiceOverdue(issued, new Date("2026-12-09T00:00:00Z"))).toBe(true);
    expect(isInvoiceOverdue(issued, new Date("2026-12-07T00:00:00Z"))).toBe(false);
    expect(isInvoiceOverdue({ ...issued, status: "paid" }, new Date("2027-01-01T00:00:00Z"))).toBe(false);
  });

  it("sorts newest period first", () => {
    const sorted = sortInvoicesNewestFirst([
      { id: "a", period_start: "2026-11-01", issued_at: "2026-11-01", created_at: "2026-11-01" },
      { id: "c", period_start: "2027-01-01", issued_at: "2027-01-01", created_at: "2027-01-01" },
      { id: "b", period_start: "2026-12-01", issued_at: "2026-12-01", created_at: "2026-12-01" }
    ]);
    expect(sorted.map((invoice) => invoice.id)).toEqual(["c", "b", "a"]);
  });

  it("builds the I've paid message with restaurant and invoice number", () => {
    const message = buildPaymentReceiptMessage({
      restaurantName: "Chai Xpress",
      invoiceNumber: "WO-2026-0001",
      amount: 299,
      currency: "AED"
    });
    expect(message).toContain("Restaurant: Chai Xpress");
    expect(message).toContain("Invoice: WO-2026-0001");
    expect(plain(message)).toContain("AED 299");
  });

  it("formats in the stored currency", () => {
    expect(plain(formatBillingAmount(299, "AED"))).toBe("AED 299");
    expect(plain(formatBillingAmount(1490.5, "AED"))).toBe("AED 1,490.50");
    expect(formatBillingAmount(10, "USD")).toContain("10");
    expect(formatBillingAmount(10, "USD")).not.toContain("AED");
  });

  it("formats calendar dates without a timezone shift", () => {
    expect(formatBillingDate("2026-12-01")).toBe("1 Dec 2026");
    expect(formatBillingDate("2026-12-31T00:00:00.000Z")).toBe("31 Dec 2026");
    expect(daysBetween("2026-11-14", "2026-11-18")).toBe(4);
  });
});

describe("access", () => {
  it("limits billing to restaurant admins and owners", () => {
    expect(canViewBilling("owner")).toBe(true);
    expect(canViewBilling("restaurant_admin")).toBe(true);
    expect(canViewBilling("manager")).toBe(false);
    expect(canViewBilling("staff")).toBe(false);
  });

  it("validates invoice ids", () => {
    expect(isUuid("00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isUuid("1 or 1=1")).toBe(false);
  });
});
