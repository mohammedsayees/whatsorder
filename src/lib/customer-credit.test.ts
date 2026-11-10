import { describe, expect, it } from "vitest";

import {
  automaticCreditReminderKind,
  buildCustomerCreditReminderMessage,
  calculateCustomerCreditSummary
} from "./customer-credit";
import type {
  CustomerCreditAccount,
  CustomerCreditEntry,
  Restaurant
} from "./types";

const account: CustomerCreditAccount = {
  id: "account-1",
  restaurant_id: "restaurant-1",
  customer_id: "customer-1",
  is_enabled: true,
  credit_limit: 100,
  terms_days: 7,
  reminders_enabled: true,
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-01T00:00:00.000Z"
};

function entry(overrides: Partial<CustomerCreditEntry>): CustomerCreditEntry {
  return {
    id: crypto.randomUUID(),
    restaurant_id: "restaurant-1",
    account_id: "account-1",
    order_id: null,
    entry_type: "adjustment",
    amount: 0,
    due_date: null,
    payment_method: null,
    note: null,
    actor_user_id: null,
    created_at: "2026-11-01T00:00:00.000Z",
    ...overrides
  };
}

describe("customer credit", () => {
  it("allocates partial payments to the oldest charges and calculates overdue", () => {
    const summary = calculateCustomerCreditSummary(
      account,
      [
        entry({ amount: 40, due_date: "2026-11-05", entry_type: "charge" }),
        entry({ amount: 30, due_date: "2026-11-15", entry_type: "charge" }),
        entry({ amount: -50, entry_type: "payment", payment_method: "cash" })
      ],
      "2026-11-10"
    );

    expect(summary.balance).toBe(20);
    expect(summary.overdue).toBe(0);
    expect(summary.available).toBe(80);
    expect(summary.oldestOutstandingDueDate).toBe("2026-11-15");
  });

  it("selects only configured reminder milestones", () => {
    const base = calculateCustomerCreditSummary(
      account,
      [entry({ amount: 40, due_date: "2026-11-07", entry_type: "charge" })],
      "2026-11-10"
    );
    expect(automaticCreditReminderKind(base, "2026-11-10")).toBe("overdue_3");
    expect(automaticCreditReminderKind(base, "2026-11-11")).toBeNull();
    expect(automaticCreditReminderKind(base, "2026-11-14")).toBe("overdue_7");
    expect(automaticCreditReminderKind(base, "2026-11-21")).toBe("overdue_weekly");
  });

  it("builds a reminder from recorded balances without exposing order items", () => {
    const summary = calculateCustomerCreditSummary(
      account,
      [entry({ amount: 40, due_date: "2026-11-05", entry_type: "charge" })],
      "2026-11-10"
    );
    const restaurant = {
      name: "Chai Xpress",
      currency_code: "AED",
      locale: "en-AE"
    } as Restaurant;
    const message = buildCustomerCreditReminderMessage({
      customer: { name: "Ahmed" },
      restaurant,
      summary
    });
    expect(message).toContain("outstanding balance with Chai Xpress");
    expect(message).toContain("is overdue");
  });
});
