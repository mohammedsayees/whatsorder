// Cash over/short trend per staff member, from closed shifts. Each shift is
// counted against the person who opened it (they are responsible for the
// drawer); differences under 0.005 count as balanced, as on the close form.

export type VarianceShift = {
  opened_by_user_id: string;
  difference_amount: number | null;
  card_difference_amount: number | null;
};

export type StaffCashVariance = {
  userId: string;
  shiftCount: number;
  balancedCount: number;
  shortCount: number;
  shortTotal: number;
  overCount: number;
  overTotal: number;
  /** Over minus short; negative means money missing overall. */
  net: number;
  largestShort: number;
  cardMismatchCount: number;
};

const tolerance = 0.005;

function money(value: number) {
  return Math.round(value * 100) / 100;
}

export function summarizeCashVariance(shifts: VarianceShift[]): StaffCashVariance[] {
  const byUser = new Map<string, StaffCashVariance>();

  for (const shift of shifts) {
    const row = byUser.get(shift.opened_by_user_id) ?? {
      userId: shift.opened_by_user_id,
      shiftCount: 0,
      balancedCount: 0,
      shortCount: 0,
      shortTotal: 0,
      overCount: 0,
      overTotal: 0,
      net: 0,
      largestShort: 0,
      cardMismatchCount: 0
    };
    const difference = Number(shift.difference_amount ?? 0);
    const card = Number(shift.card_difference_amount ?? 0);

    row.shiftCount += 1;
    if (difference <= -tolerance) {
      row.shortCount += 1;
      row.shortTotal = money(row.shortTotal - difference);
      row.largestShort = Math.max(row.largestShort, money(-difference));
    } else if (difference >= tolerance) {
      row.overCount += 1;
      row.overTotal = money(row.overTotal + difference);
    } else {
      row.balancedCount += 1;
    }
    if (Math.abs(card) >= tolerance) {
      row.cardMismatchCount += 1;
    }
    row.net = money(row.overTotal - row.shortTotal);
    byUser.set(row.userId, row);
  }

  // Most money missing first, then most frequent shortages.
  return [...byUser.values()].sort((a, b) =>
    b.shortTotal - a.shortTotal || b.shortCount - a.shortCount || b.shiftCount - a.shiftCount
  );
}
