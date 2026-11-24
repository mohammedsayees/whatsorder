import type { PaymentMethod } from "@/lib/types";

// Pure helpers for the rider's delivery actions and the rider cash ledger.
// Money is handled in whole minor units (fils/paise) to avoid float drift.

export const MAX_RIDER_CASH_AMOUNT = 100_000;

export type RiderAction = "picked_up" | "delivered" | "failed";
export const RIDER_ACTIONS: readonly RiderAction[] = ["picked_up", "delivered", "failed"];

export type RiderCollectionMethod = "Cash on Delivery" | "Card on Delivery";

export type RiderCashEntryType =
  | "float_issued"
  | "change_advance"
  | "order_cash"
  | "handover"
  | "variance";

export const RIDER_CASH_ENTRY_LABELS: Record<RiderCashEntryType, string> = {
  float_issued: "Change float given",
  change_advance: "Change for an order",
  order_cash: "Order cash collected",
  handover: "Cash handed over",
  variance: "Settlement difference"
};

export function toMinorUnits(value: number) {
  return Math.round(value * 100);
}

export function fromMinorUnits(value: number) {
  return Math.round(value) / 100;
}

/** Parses a money amount typed by a person or sent by a client. */
export function parseMoneyAmount(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d{1,7}(\.\d{1,2})?$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_RIDER_CASH_AMOUNT) {
    return null;
  }

  return fromMinorUnits(toMinorUnits(parsed));
}

/** Change to hand back; null when the customer gave less than is due. */
export function calculateChange(due: number, tendered: number): number | null {
  const change = toMinorUnits(tendered) - toMinorUnits(due);
  return change < 0 ? null : fromMinorUnits(change);
}

export type CollectionPlan =
  | { kind: "cash"; due: number }
  | { kind: "card"; due: number }
  /** Nothing for the rider to collect (paid online, credit, UPI, or free). */
  | { kind: "none"; due: number; reason: "prepaid" | "confirm_with_restaurant" | "nothing_due" }
  /** The rider cannot complete this order until the restaurant resolves it. */
  | { kind: "blocked"; due: number; reason: string };

export function collectionPlan(order: {
  payment_method: PaymentMethod | null;
  total: number;
  online_payment_status?: string | null;
}): CollectionPlan {
  const due = Number(order.total) || 0;

  if (order.payment_method === "Online Payment") {
    return order.online_payment_status && order.online_payment_status !== "paid"
      ? { kind: "blocked", due, reason: "Online payment is not confirmed yet. Ask the restaurant." }
      : { kind: "none", due, reason: "prepaid" };
  }

  if (order.payment_method === "Customer Credit") {
    return { kind: "none", due, reason: "prepaid" };
  }

  if (order.payment_method === "UPI") {
    return { kind: "none", due, reason: "confirm_with_restaurant" };
  }

  if (due <= 0) {
    return { kind: "none", due, reason: "nothing_due" };
  }

  if (order.payment_method === "Card on Delivery") {
    return { kind: "card", due };
  }

  if (order.payment_method === "Cash on Delivery") {
    return { kind: "cash", due };
  }

  return { kind: "none", due, reason: "confirm_with_restaurant" };
}

export type RiderActionRequest = {
  token: string;
  action: RiderAction;
  tenderedAmount: number | null;
  method: RiderCollectionMethod | null;
  reason: string | null;
};

/** Validates an untrusted body from the rider page. */
export function parseRiderActionBody(value: unknown): RiderActionRequest | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const body = value as Record<string, unknown>;
  const action = RIDER_ACTIONS.find((candidate) => candidate === body.action);

  if (typeof body.token !== "string" || !action) {
    return null;
  }

  let tenderedAmount: number | null = null;

  if (body.tenderedAmount !== undefined && body.tenderedAmount !== null && body.tenderedAmount !== "") {
    tenderedAmount = parseMoneyAmount(body.tenderedAmount);

    if (tenderedAmount === null) {
      return null;
    }
  }

  let method: RiderCollectionMethod | null = null;

  if (body.method !== undefined && body.method !== null && body.method !== "") {
    if (body.method !== "Cash on Delivery" && body.method !== "Card on Delivery") {
      return null;
    }

    method = body.method;
  }

  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, 200) || null : null;

  if (action === "failed" && !reason) {
    return null;
  }

  return { token: body.token, action, tenderedAmount, method, reason };
}

/** Messages the rider can act on; anything else stays generic. */
export function friendlyRiderActionError(message: string | undefined): string {
  const text = message ?? "";

  if (text.includes("kitchen has not released")) {
    return "The kitchen has not released this order yet. Try again in a moment.";
  }
  if (text.includes("Cash received is less")) {
    return "The cash received is less than the amount due.";
  }
  if (text.includes("Cash received is too high")) {
    return "Check the cash amount you entered.";
  }
  if (text.includes("Online payment is not confirmed")) {
    return "Online payment is not confirmed yet. Ask the restaurant.";
  }
  if (text.includes("reason")) {
    return "Tell us why the order could not be delivered.";
  }

  return "That did not go through. Please try again.";
}

export type RiderCashEntryLike = {
  entry_type: RiderCashEntryType;
  amount: number;
};

export type RiderLedgerTotals = {
  /** What the rider should be holding right now. */
  balance: number;
  floatsAndAdvances: number;
  orderCash: number;
  handedOver: number;
  variance: number;
};

export function summarizeRiderLedger(entries: readonly RiderCashEntryLike[]): RiderLedgerTotals {
  const totals = { advances: 0, orderCash: 0, handedOver: 0, variance: 0 };

  for (const entry of entries) {
    const cents = toMinorUnits(Number(entry.amount) || 0);

    switch (entry.entry_type) {
      case "float_issued":
      case "change_advance":
        totals.advances += cents;
        break;
      case "order_cash":
        totals.orderCash += cents;
        break;
      case "handover":
        totals.handedOver += cents;
        break;
      case "variance":
        totals.variance += cents;
        break;
    }
  }

  return {
    balance: fromMinorUnits(totals.advances + totals.orderCash + totals.handedOver + totals.variance),
    floatsAndAdvances: fromMinorUnits(totals.advances),
    orderCash: fromMinorUnits(totals.orderCash),
    handedOver: fromMinorUnits(-totals.handedOver),
    variance: fromMinorUnits(totals.variance)
  };
}

export type SettlementPlan = {
  entries: Array<{ entry_type: "handover" | "variance"; amount: number }>;
  /** Positive = rider is short, negative = rider has extra cash. */
  shortfall: number;
  remaining: number;
};

/**
 * Turns "the rider handed over X" into ledger entries.
 * A partial handover just reduces the balance. Settling in full records a
 * variance for any difference so the balance returns to zero.
 */
export function planRiderSettlement(input: {
  balance: number;
  handedOver: number;
  settleInFull: boolean;
}): SettlementPlan | null {
  const balance = toMinorUnits(input.balance);
  const handed = toMinorUnits(input.handedOver);

  if (handed < 0) {
    return null;
  }

  const entries: SettlementPlan["entries"] = [];

  if (handed > 0) {
    entries.push({ entry_type: "handover", amount: -fromMinorUnits(handed) });
  }

  const remainingCents = balance - handed;

  if (input.settleInFull && remainingCents !== 0) {
    entries.push({ entry_type: "variance", amount: -fromMinorUnits(remainingCents) });
  }

  if (entries.length === 0) {
    return null;
  }

  return {
    entries,
    shortfall: fromMinorUnits(input.settleInFull ? remainingCents : 0),
    remaining: input.settleInFull ? 0 : fromMinorUnits(remainingCents)
  };
}
