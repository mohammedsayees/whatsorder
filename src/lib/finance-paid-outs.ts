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

/** Database guard messages from paying a bill from the till, in plain words. */
export function tillPaymentError(message: string | undefined) {
  const text = message ?? "";
  if (text.includes("same amount without a bill")) {
    return "A paid-out of the same amount is already on this shift without a bill. If it is this bill, post the bill without the till option and link it on the Cash paid-outs page; otherwise tick that this is a different payment.";
  }
  if (text.includes("no longer open") || text.includes("Open shift not found")) return "The shift has closed. Post the bill without the till option and link it on the Cash paid-outs page.";
  if (text.includes("Only the shift opener or restaurant management")) return "Only the person who opened the shift or a manager can take cash from this till.";
  if (text.includes("already been posted")) return "This bill has already been posted.";
  if (text.includes("Invalid finance category")) return "Choose an active expense category.";
  if (text.includes("Invalid recurring schedule")) return "Choose an active recurring schedule.";
  if (text.includes("Finance is not enabled") || text.includes("only available for AED")) return "Paying bills from the till isn't available for this restaurant.";
  return "The bill could not be paid from the till. Nothing was saved. Try again.";
}

/** Database guard messages from posting a till receipt, in plain words. */
export function receiptPostingError(message: string | undefined) {
  const text = message ?? "";
  if (text.includes("Amounts differ")) return "The bill total differs from the cash paid out. Tick the confirmation and give a reason.";
  if (text.includes("Paid-out not found")) return "The till paid-out for this receipt was voided. Delete this receipt, or post the bill without it.";
  if (text.includes("already linked or dismissed")) return "The till paid-out already has a bill or was marked as not an expense.";
  if (text.includes("already been posted")) return "This bill has already been posted.";
  if (text.includes("Invalid finance category")) return "Choose an active expense category.";
  if (text.includes("Duplicate document")) return "This exact bill file has already been posted.";
  return "The receipt could not be posted. Nothing was saved. Try again.";
}

/** Database guard messages from attaching a receipt at the till, in plain words. */
export function receiptAttachError(message: string | undefined) {
  const text = message ?? "";
  if (text.includes("only while the shift is open")) return "Receipts can be attached only while the shift is open.";
  if (text.includes("Only the shift opener or restaurant management")) return "Only the person who opened the shift or a manager can attach a receipt.";
  if (text.includes("already has a bill")) return "This paid-out already has a bill in Finance.";
  if (text.includes("already attached") || text.includes("finance_documents_active_paid_out_receipt")) return "A receipt is already attached to this paid-out.";
  if (text.includes("not found or voided")) return "This paid-out was voided or no longer exists.";
  if (text.includes("not available for this restaurant")) return "Receipts aren't available for this restaurant.";
  return "The receipt could not be attached. Try again.";
}
