import { formatCurrency } from "@/lib/currency";
import type {
  Customer,
  CustomerCreditAccount,
  CustomerCreditEntry,
  CustomerCreditSummary,
  Restaurant
} from "@/lib/types";

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dateKey(value: string | null, fallback: string) {
  return value ? `${value}T00:00:00.000Z` : fallback;
}

export function calculateCustomerCreditSummary(
  account: CustomerCreditAccount,
  entries: CustomerCreditEntry[],
  today: string,
  lastReminder: CustomerCreditSummary["lastReminder"] = null
): CustomerCreditSummary {
  let availableCredits = entries.reduce(
    (sum, entry) => sum + (Number(entry.amount) < 0 ? Math.abs(Number(entry.amount)) : 0),
    0
  );
  let overdue = 0;
  let oldestOutstandingDueDate: string | null = null;

  const charges = entries
    .filter((entry) => Number(entry.amount) > 0)
    .toSorted((first, second) => {
      const firstKey = dateKey(first.due_date, first.created_at);
      const secondKey = dateKey(second.due_date, second.created_at);
      return firstKey.localeCompare(secondKey) || first.created_at.localeCompare(second.created_at);
    });

  for (const charge of charges) {
    const amount = Number(charge.amount);
    const applied = Math.min(availableCredits, amount);
    const outstanding = roundMoney(amount - applied);
    availableCredits = roundMoney(availableCredits - applied);
    if (outstanding <= 0) continue;

    if (charge.due_date && !oldestOutstandingDueDate) {
      oldestOutstandingDueDate = charge.due_date;
    }
    if (charge.due_date && charge.due_date < today) {
      overdue = roundMoney(overdue + outstanding);
    }
  }

  const balance = Math.max(
    0,
    roundMoney(entries.reduce((sum, entry) => sum + Number(entry.amount), 0))
  );

  return {
    account,
    balance,
    overdue: Math.min(balance, overdue),
    available: Math.max(0, roundMoney(Number(account.credit_limit) - balance)),
    oldestOutstandingDueDate,
    entries: entries.toSorted((first, second) =>
      second.created_at.localeCompare(first.created_at)
    ),
    lastReminder
  };
}

function utcDay(value: string) {
  return Date.parse(`${value}T00:00:00.000Z`);
}

export type CreditReminderKind = Exclude<
  NonNullable<CustomerCreditSummary["lastReminder"]>["reminder_kind"],
  "manual"
>;

export function automaticCreditReminderKind(
  summary: CustomerCreditSummary,
  today: string
): CreditReminderKind | null {
  if (
    !summary.account.is_enabled ||
    !summary.account.reminders_enabled ||
    summary.balance <= 0 ||
    !summary.oldestOutstandingDueDate
  ) {
    return null;
  }

  const dayDifference = Math.round(
    (utcDay(summary.oldestOutstandingDueDate) - utcDay(today)) / 86_400_000
  );
  if (dayDifference === 1) return "due_tomorrow";
  if (dayDifference === 0) return "due_today";

  const daysOverdue = Math.abs(dayDifference);
  if (dayDifference < 0 && daysOverdue === 3) return "overdue_3";
  if (dayDifference < 0 && daysOverdue === 7) return "overdue_7";
  if (dayDifference < 0 && daysOverdue > 7 && daysOverdue % 7 === 0) {
    return "overdue_weekly";
  }
  return null;
}

export function buildCustomerCreditReminderMessage(input: {
  customer: Pick<Customer, "name">;
  restaurant: Restaurant;
  summary: CustomerCreditSummary;
}) {
  const { customer, restaurant, summary } = input;
  const lines = [
    `Hello ${customer.name},`,
    `Your outstanding balance with ${restaurant.name} is ${formatCurrency(
      summary.balance,
      restaurant
    )}.`
  ];

  if (summary.overdue > 0) {
    lines.push(
      `${formatCurrency(summary.overdue, restaurant)} is overdue. Please arrange payment or contact us if you need help.`
    );
  } else if (summary.oldestOutstandingDueDate) {
    lines.push(`Next due date: ${summary.oldestOutstandingDueDate}.`);
  }

  lines.push("Thank you.");
  return lines.join("\n");
}
