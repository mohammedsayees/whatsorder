// "Commission kept" — how much aggregator (e.g. Talabat) commission a restaurant
// has avoided by taking DELIVERY orders through WhatsOrder instead.
//
// commission kept = (food subtotal of completed DELIVERY orders) × commission rate.
//
// The rate logic lives here (one tested place): when the owner has set their own
// commission_rate we use it; otherwise we fall back to a clearly-labelled 27%
// default. The UI must show the basis (`isDefaultRate`) so the figure is never a
// bare, unexplained number.

// Default aggregator delivery commission, as a percentage. Shown labelled when
// the restaurant has not set its own rate.
export const DEFAULT_COMMISSION_RATE = 27;

// Raw totals for completed delivery orders, as returned by the
// get_restaurant_commission_kept RPC (or computed from demo data). `base` is the
// food subtotal — delivery fees are excluded so the figure stays conservative.
export type CommissionKeptTotals = {
  monthOrders: number;
  monthBase: number;
  allTimeOrders: number;
  allTimeBase: number;
};

export type CommissionKeptPeriod = {
  orders: number;
  kept: number;
};

export type CommissionKept = {
  // Effective rate applied, as a percentage (e.g. 27).
  rate: number;
  // True when we fell back to DEFAULT_COMMISSION_RATE (no owner-set rate).
  isDefaultRate: boolean;
  month: CommissionKeptPeriod;
  allTime: CommissionKeptPeriod;
};

// A usable, owner-set rate is a finite number strictly above 0 and at most 100.
// Anything else (null, undefined, NaN, 0, negative, >100) falls back to the
// labelled default — a 0% commission would make the figure meaningless.
function isUsableRate(rate: number | null | undefined): rate is number {
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 && rate <= 100;
}

export function resolveCommissionRate(rate: number | null | undefined): {
  rate: number;
  isDefaultRate: boolean;
} {
  if (isUsableRate(rate)) {
    return { rate, isDefaultRate: false };
  }

  return { rate: DEFAULT_COMMISSION_RATE, isDefaultRate: true };
}

export function computeCommissionKept(
  totals: CommissionKeptTotals,
  commissionRate: number | null | undefined
): CommissionKept {
  const { rate, isDefaultRate } = resolveCommissionRate(commissionRate);
  const factor = rate / 100;

  return {
    rate,
    isDefaultRate,
    month: {
      orders: totals.monthOrders,
      kept: totals.monthBase * factor
    },
    allTime: {
      orders: totals.allTimeOrders,
      kept: totals.allTimeBase * factor
    }
  };
}
