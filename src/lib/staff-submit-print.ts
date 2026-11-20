import type { PrintKind } from "@/lib/order-print";

/**
 * Which tickets the POS prints automatically when a staff order is saved.
 * - Send KOT ("kitchen") always prints the kitchen copy.
 * - Pay (cash/card/credit/UPI) prints the KOT unless staff unticked it.
 * - The customer bill prints whenever "Print customer bill" is ticked.
 */
export function submitPrintKinds({
  action,
  printKot,
  printCustomerBill
}: {
  action: string;
  printKot: boolean;
  printCustomerBill: boolean;
}): PrintKind[] {
  const kinds: PrintKind[] = [];
  if (printCustomerBill) kinds.push("receipt");
  if (action === "kitchen" || printKot) kinds.push("kot");
  return kinds;
}
