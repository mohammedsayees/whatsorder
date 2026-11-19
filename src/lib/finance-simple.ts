// Plain-language helpers for Finance "Simple mode": the default for everyone.
// Pure functions only, so they can run on the server and in the browser.
import type { FinanceOperatingReport } from "@/lib/finance-report";

export type FinanceMode = "simple" | "advanced";
export const FINANCE_MODE_COOKIE = "wo_finance_mode";

/** Only owners and admins may switch to the advanced view; everyone else is simple. */
export function resolveFinanceMode(role: string, cookieValue: string | undefined): FinanceMode {
  const canUseAdvanced = role === "owner" || role === "restaurant_admin";
  return canUseAdvanced && cookieValue === "advanced" ? "advanced" : "simple";
}

export function canUseAdvancedFinance(role: string) {
  return role === "owner" || role === "restaurant_admin";
}

/** A friendly icon for a category, picked from its name. */
export function categoryIcon(name: string) {
  const text = name.toLowerCase();
  if (/(ingredient|food|stock|grocer|vegetable|meat|milk|tea)/.test(text)) return "🥬";
  if (/packag/.test(text)) return "📦";
  if (/rent/.test(text)) return "🏠";
  if (/(salar|wage|staff|payroll)/.test(text)) return "👥";
  if (/(utilit|electric|water|dewa|gas|internet|phone)/.test(text)) return "💡";
  if (/(equipment|capex|machine|repair)/.test(text)) return "🔧";
  if (/(tax|government|licen|fee)/.test(text)) return "🏛️";
  if (/(transport|fuel|delivery)/.test(text)) return "🚚";
  if (/(clean|maintenance)/.test(text)) return "🧽";
  return "➕";
}

/** Short everyday name for a category ("Ingredients & packaging" → "Food & drinks stock"). */
export function categoryLabel(name: string) {
  const text = name.trim();
  if (/^ingredients\s*&\s*packaging$/i.test(text)) return "Food, drinks & packaging";
  if (/^equipment\s*\/\s*capex$/i.test(text)) return "Equipment";
  if (/^taxes\s*&\s*government fees$/i.test(text)) return "Licences & fees";
  if (/^utilities$/i.test(text)) return "Electricity, water & internet";
  return text;
}

export type SimplePaymentChoice = "till" | "cash" | "card" | "bank" | "later";

export const SIMPLE_PAYMENT_LABELS: Record<SimplePaymentChoice, { icon: string; label: string }> = {
  till: { icon: "💵", label: "Cash from the till" },
  cash: { icon: "💰", label: "Cash (not from the till)" },
  card: { icon: "💳", label: "Card" },
  bank: { icon: "🏦", label: "Bank transfer" },
  later: { icon: "⏳", label: "Not paid yet" }
};

/** Form fields the existing Finance actions expect for a simple payment choice. */
export function paymentFields(choice: SimplePaymentChoice, today: string): Record<string, string> {
  switch (choice) {
    case "till":
      return { pay_from_till: "on", payment_status: "paid", payment_method: "cash", paid_on: today };
    case "cash":
      return { payment_status: "paid", payment_method: "cash", paid_on: today };
    case "card":
      return { payment_status: "paid", payment_method: "card", paid_on: today };
    case "bank":
      return { payment_status: "paid", payment_method: "bank_transfer", paid_on: today };
    default:
      return { payment_status: "unpaid", payment_method: "", paid_on: "" };
  }
}

/** Fils → "12.50" for form fields (no currency symbol). */
export function filsToInput(fils: number | null | undefined) {
  return fils === null || fils === undefined || !Number.isFinite(fils) ? "" : (fils / 100).toFixed(2);
}

/** "12.5" → 1250 fils, or null when not a valid non-negative amount with ≤ 2 decimals. */
export function inputToFils(value: string) {
  const text = value.trim();
  if (!/^(?:0|[1-9]\d{0,10})(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** "2026-11-18" → "18 Nov" (adds the year when it isn't the current one). */
export function friendlyDate(isoDate: string, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const label = `${Number(match[3])} ${months[Number(match[2]) - 1]}`;
  return Number(match[1]) === now.getUTCFullYear() ? label : `${label} ${match[1]}`;
}

export function plainPaymentStatus(status: string) {
  if (status === "paid") return "Paid";
  if (status === "partial") return "Part paid";
  return "Not paid yet";
}

export function plainBillStatus(status: string) {
  if (status === "approved") return "Saved";
  if (status === "draft") return "Not checked yet";
  return "Deleted";
}

export type SimpleSummary = {
  salesFils: number;
  costsFils: number;
  profitFils: number | null;
  trend: "up" | "down" | "same" | "unknown";
  sentences: string[];
  missingCostItems: number;
};

/** Turns the detailed report into three numbers and a few plain sentences. */
export function buildSimpleSummary(
  current: FinanceOperatingReport,
  prior: FinanceOperatingReport,
  format: (fils: number) => string
): SimpleSummary {
  const foodCost = current.estimatedConsumedCostFils ?? current.knownDirectCostFils;
  const costsFils = foodCost + current.channelFeesFils + current.accruedOperatingCostFils;
  const profitFils = current.estimatedOperatingResultFils;
  const priorProfit = prior.estimatedOperatingResultFils;
  const trend = profitFils === null || priorProfit === null
    ? "unknown"
    : profitFils > priorProfit ? "up" : profitFils < priorProfit ? "down" : "same";
  const missingCostItems = current.products.filter((product) => product.completeness === "incomplete").length;

  const sentences: string[] = [];
  if (current.orderCount === 0) {
    sentences.push("No completed orders in this period yet.");
  } else {
    sentences.push(`${current.orderCount} completed order${current.orderCount === 1 ? "" : "s"}.`);
  }
  if (current.estimatedConsumedCostFils !== null && current.netSalesFils > 0) {
    const pct = Math.round(current.estimatedConsumedCostFils * 100 / current.netSalesFils);
    const verdict = pct <= 35 ? "healthy for a café" : pct <= 45 ? "a little high" : "high – check prices and portions";
    sentences.push(`Food costs are about ${pct}% of sales – ${verdict}.`);
  }
  if (current.accruedOperatingCostFils > 0) {
    sentences.push(`Rent, salaries and other running costs: ${format(current.accruedOperatingCostFils)}.`);
  } else {
    sentences.push("No rent or salaries added yet, so profit may look higher than it really is.");
  }
  if (current.channelFeesFils > 0) {
    sentences.push(`Delivery app fees: ${format(current.channelFeesFils)}.`);
  }
  const best = current.products.find((product) => product.contributionFils !== null && product.contributionFils > 0);
  if (best) sentences.push(`${best.name} made the most money.`);
  if (missingCostItems > 0) {
    sentences.push(`${missingCostItems} menu item${missingCostItems === 1 ? " has" : "s have"} no food cost yet, so profit is an estimate.`);
  }
  return { salesFils: current.netSalesFils, costsFils, profitFils, trend, sentences, missingCostItems };
}

/** Monthly bills offered in the two-minute setup, mapped to default categories. */
export const SETUP_MONTHLY_BILLS = [
  { key: "rent", label: "Rent", category: "Rent", icon: "🏠" },
  { key: "salaries", label: "Salaries", category: "Salaries", icon: "👥" },
  { key: "power", label: "Electricity & water", category: "Utilities", icon: "💡" },
  { key: "internet", label: "Internet & phone", category: "Utilities", icon: "📶" },
  { key: "other", label: "Other monthly bill", category: "Other", icon: "➕" }
] as const;

/** First day of the month before the given ISO date ("2026-11-18" → "2026-10-01"). */
export function firstDayOfPreviousMonth(isoDate: string) {
  const [year, month] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return date.toISOString().slice(0, 10);
}

/**
 * A monthly bill set up today counts from the 1st of this month, so this
 * month's rent is included in this month's profit. Next due: this month's day
 * if it hasn't passed, otherwise next month's.
 */
export function monthlyBillSchedule(todayIso: string, dayOfMonth: number) {
  const [year, month, day] = todayIso.split("-").map(Number);
  const startOn = `${todayIso.slice(0, 7)}-01`;
  const due = day <= dayOfMonth
    ? new Date(Date.UTC(year, month - 1, dayOfMonth))
    : new Date(Date.UTC(year, month, dayOfMonth));
  return { startOn, nextDueOn: due.toISOString().slice(0, 10) };
}


export type MoneyTourStep = {
  /** Value of the data-tour attribute to highlight, or null for a centred card. */
  target: string | null;
  title: string;
  body: string;
};

export const MONEY_TOUR_STORAGE_KEY = "wo_money_tour_v1";

/** A short first-visit tour of the Money home, matched to what this person can do. */
export function buildMoneyTourSteps(access: {
  create: boolean;
  view: boolean;
  approve: boolean;
  view_reports: boolean;
  manage_recurring?: boolean;
  manage_costing?: boolean;
}, options: { hasSetupCard?: boolean; hasTillPayments?: boolean } = {}): MoneyTourStep[] {
  const steps: MoneyTourStep[] = [{
    target: null,
    title: "Welcome to Money 👋",
    body: access.view
      ? "This is where you add the café’s bills and see how the café is doing. This quick tour takes 30 seconds."
      : "This is where you send the café’s bills to your manager. This quick tour takes 20 seconds."
  }];
  if (options.hasSetupCard && (access.manage_recurring || access.manage_costing)) {
    steps.push({
      target: "setup",
      title: "Start here once",
      body: "Add your rent, salaries and what each menu item costs you. It takes a few minutes and makes the profit numbers right."
    });
  }
  if (access.create) {
    steps.push({
      target: "add-bill",
      title: "Got a paper bill?",
      body: "Tap here and take a photo of it. We read the bill for you – you just check it and tap Save."
    });
    steps.push({
      target: "type-bill",
      title: "No photo?",
      body: "Tap here to type the bill in. There are only four quick questions."
    });
  }
  if (access.approve && options.hasTillPayments) {
    steps.push({
      target: "till-payments",
      title: "Cash taken from the till",
      body: "If someone paid a supplier with cash from the till, match it to its bill here so the money adds up."
    });
  }
  if (access.view) {
    steps.push({
      target: "todo",
      title: "Your to-do list",
      body: "Anything that needs you shows up here – like a bill to check. When it says “Nothing to do”, you’re all done."
    });
  }
  if (access.view_reports) {
    steps.push({
      target: "how-am-i-doing",
      title: "How is the café doing?",
      body: "Tap here to see sales, costs and profit in plain words."
    });
  }
  steps.push({
    target: null,
    title: "That’s it! ✓",
    body: access.view
      ? "You can watch this tour again any time from the link at the bottom of this page."
      : "After you send a bill, a manager checks it. You can watch this tour again from the bottom of this page."
  });
  return steps;
}
