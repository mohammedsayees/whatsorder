import type { PaidOutBillStatus } from "@/lib/finance-paid-out-data";

const labels: Record<PaidOutBillStatus, { text: string; className: string }> = {
  linked: { text: "Bill attached", className: "bg-emerald-100 text-emerald-800" },
  dismissed: { text: "Not an expense", className: "bg-stone-200 text-stone-700" },
  none: { text: "No bill yet", className: "bg-amber-100 text-amber-800" }
};

// Status only: never shows finance amounts, suppliers or categories, so it is
// safe for staff without Finance access.
export function PaidOutBillBadge({ status }: { status: PaidOutBillStatus }) {
  const label = labels[status];
  return (
    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${label.className}`}>
      {label.text}
    </span>
  );
}
