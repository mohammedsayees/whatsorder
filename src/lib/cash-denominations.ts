// Notes and coins a cashier can count the drawer by. Amounts are in minor
// units (fils / paise) so totals are exact. Keep in step with the SQL list in
// supabase/migrations/20261121150000_cash_count_denominations.sql.

export type CashCurrency = "AED" | "INR";

export type CashDenomination = {
  /** Minor units: 50000 = AED 500, 25 = 25 fils. */
  minor: number;
  kind: "note" | "coin";
};

export type CashDenominationCount = {
  /** Minor units of one note/coin. */
  minor: number;
  count: number;
};

export const cashDenominations: Record<CashCurrency, CashDenomination[]> = {
  AED: [
    { minor: 100000, kind: "note" },
    { minor: 50000, kind: "note" },
    { minor: 20000, kind: "note" },
    { minor: 10000, kind: "note" },
    { minor: 5000, kind: "note" },
    { minor: 2000, kind: "note" },
    { minor: 1000, kind: "note" },
    { minor: 500, kind: "note" },
    { minor: 100, kind: "coin" },
    { minor: 50, kind: "coin" },
    { minor: 25, kind: "coin" }
  ],
  INR: [
    { minor: 50000, kind: "note" },
    { minor: 20000, kind: "note" },
    { minor: 10000, kind: "note" },
    { minor: 5000, kind: "note" },
    // ₹20 and ₹10 circulate as both notes and coins; one row each is enough.
    { minor: 2000, kind: "note" },
    { minor: 1000, kind: "note" },
    { minor: 500, kind: "coin" },
    { minor: 200, kind: "coin" },
    { minor: 100, kind: "coin" }
  ]
};

export const maxDenominationCount = 100_000;

export function denominationsFor(currency: string | null | undefined) {
  return currency === "INR" ? cashDenominations.INR : cashDenominations.AED;
}

export function denominationTotalMinor(counts: CashDenominationCount[]) {
  return counts.reduce((sum, row) => sum + row.minor * row.count, 0);
}

/**
 * Parses the breakdown a form posts as JSON. Returns null when no breakdown
 * was used, the cleaned rows (zero counts dropped, largest first) when it is
 * valid and adds up to `amount`, or an error.
 */
export function parseCashDenominations(
  raw: unknown,
  currency: string | null | undefined,
  amount: number
): { denominations: CashDenominationCount[] | null; error?: string } {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { denominations: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return { denominations: null, error: "The notes and coins breakdown could not be read." };
  }

  if (!Array.isArray(parsed)) {
    return { denominations: null, error: "The notes and coins breakdown could not be read." };
  }

  const allowed = new Set(denominationsFor(currency).map((denomination) => denomination.minor));
  const counts = new Map<number, number>();

  for (const item of parsed) {
    const minor = Number((item as { minor?: unknown })?.minor);
    const count = Number((item as { count?: unknown })?.count);
    if (!allowed.has(minor) || counts.has(minor) || !Number.isInteger(count) ||
        count < 0 || count > maxDenominationCount) {
      return { denominations: null, error: "Enter whole numbers of notes and coins." };
    }
    counts.set(minor, count);
  }

  const rows = [...counts.entries()]
    .filter(([, count]) => count > 0)
    .map(([minor, count]) => ({ minor, count }))
    .sort((a, b) => b.minor - a.minor);

  if (rows.length === 0) {
    return { denominations: null };
  }

  if (denominationTotalMinor(rows) !== Math.round(amount * 100)) {
    return {
      denominations: null,
      error: "The notes and coins don't add up to the counted cash. Check the counts."
    };
  }

  return { denominations: rows };
}
