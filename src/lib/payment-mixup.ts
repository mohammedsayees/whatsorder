// Spots a likely payment-method mix-up in a closed shift: one method counted
// over while another counted short, e.g. cash over and card short means some
// orders recorded as card were really paid in cash. Pure, so the shift report
// and the shifts list flag the same shifts.

export type DrawerMethod = "cash" | "card" | "upi";

export type PaymentMixup = {
  /** Method that counted over: the money was really paid this way. */
  overMethod: DrawerMethod;
  /** Method that counted short: orders were recorded this way by mistake. */
  shortMethod: DrawerMethod;
  overAmount: number;
  shortAmount: number;
};

/** Differences smaller than this are counting noise (e.g. 25 fils), not mix-ups. */
export const MIXUP_MIN_AMOUNT = 1;

export const orderPaymentMethodFor: Record<DrawerMethod, string> = {
  cash: "Cash on Delivery",
  card: "Card on Delivery",
  upi: "UPI"
};

export const drawerMethodLabels: Record<DrawerMethod, string> = {
  cash: "Cash",
  card: "Card",
  upi: "UPI"
};

/**
 * Differences are counted minus expected (positive = over). Returns the pair
 * with one method over and another short, both by at least MIXUP_MIN_AMOUNT;
 * when several pairs qualify, the one with the larger overlapping amount.
 */
export function detectPaymentMixup(differences: {
  cash: number | null;
  card: number | null;
  upi?: number | null;
}): PaymentMixup | null {
  const values = (["cash", "card", "upi"] as const)
    .map((method) => ({ method, value: Number(differences[method] ?? 0) }))
    .filter(({ value }) => Number.isFinite(value) && Math.abs(value) >= MIXUP_MIN_AMOUNT);

  let best: PaymentMixup | null = null;
  for (const over of values.filter(({ value }) => value > 0)) {
    for (const short of values.filter(({ value }) => value < 0)) {
      const candidate: PaymentMixup = {
        overMethod: over.method,
        shortMethod: short.method,
        overAmount: Math.round(over.value * 100) / 100,
        shortAmount: Math.round(-short.value * 100) / 100
      };
      if (!best || Math.min(candidate.overAmount, candidate.shortAmount) >
          Math.min(best.overAmount, best.shortAmount)) {
        best = candidate;
      }
    }
  }
  return best;
}

export type MixupCandidateOrder = { id: string; total: number };

/**
 * Orders worth checking: recorded as the short method and not larger than the
 * overlapping amount (plus a little slack). Exact matches first, then closest.
 */
export function rankMixupCandidates<T extends MixupCandidateOrder>(
  orders: T[],
  mixup: PaymentMixup
): Array<T & { exactMatch: boolean }> {
  const target = Math.min(mixup.overAmount, mixup.shortAmount);
  return orders
    .filter((order) => order.total > 0 && order.total <= target + 0.5)
    .map((order) => ({ ...order, exactMatch: Math.abs(order.total - target) < 0.005 }))
    .sort((a, b) => Math.abs(a.total - target) - Math.abs(b.total - target))
    .slice(0, 8);
}
