import { parseAedToFilsAllowZero } from "@/lib/finance";

// Shift paid-outs are stored as numeric(10,2) restaurant-currency amounts.
// Finance works in integer fils, so convert through a fixed 2-decimal string to
// avoid float drift (12.3 * 100 = 1230.0000000000002).
export function paidOutAmountToFils(amount: unknown): number | null {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return null;
  const fils = parseAedToFilsAllowZero(value.toFixed(2));
  return fils !== null && fils > 0 ? fils : null;
}

export type PaidOutMatch = {
  differenceFils: number;
  // Payment status the expense gets once linked to this paid-out.
  paymentStatus: "paid" | "partial";
  needsConfirmation: boolean;
};

// Paid-out minus bill total. Positive: more cash left the till than the bill.
export function comparePaidOutToExpense(paidOutFils: number, expenseTotalFils: number): PaidOutMatch {
  if (!Number.isSafeInteger(paidOutFils) || paidOutFils <= 0 ||
      !Number.isSafeInteger(expenseTotalFils) || expenseTotalFils <= 0) {
    throw new Error("Invalid paid-out comparison.");
  }
  const differenceFils = paidOutFils - expenseTotalFils;
  return {
    differenceFils,
    paymentStatus: paidOutFils < expenseTotalFils ? "partial" : "paid",
    needsConfirmation: differenceFils !== 0
  };
}

export type LinkCandidate = {
  id: string;
  total_fils: number;
  incurred_on: string;
};

function dayDistance(first: string, second: string) {
  return Math.abs(Date.parse(`${first}T00:00:00Z`) - Date.parse(`${second}T00:00:00Z`)) / 86_400_000;
}

// Best matches first: exact amount, then closest amount, then closest date.
export function rankLinkCandidates<T extends LinkCandidate>(
  candidates: T[],
  paidOutFils: number,
  businessDate: string,
  limit = 10
): T[] {
  return candidates
    .map((candidate) => ({
      candidate,
      amountGap: Math.abs(candidate.total_fils - paidOutFils),
      dateGap: dayDistance(candidate.incurred_on, businessDate)
    }))
    .toSorted((first, second) =>
      first.amountGap - second.amountGap ||
      first.dateGap - second.dateGap ||
      first.candidate.id.localeCompare(second.candidate.id)
    )
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

export function formatDifference(differenceFils: number, format: (fils: number) => string) {
  if (differenceFils === 0) return "Exact match";
  return differenceFils > 0
    ? `Till paid ${format(differenceFils)} more than the bill`
    : `Till paid ${format(-differenceFils)} less than the bill`;
}
