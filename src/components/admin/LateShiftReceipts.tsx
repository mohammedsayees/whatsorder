import Link from "next/link";
import { formatCurrency } from "@/lib/currency";
import { formatRestaurantShortDateTime } from "@/lib/date-time";
import type { LateShiftReceipt } from "@/lib/shift-data";
import type { Restaurant } from "@/lib/types";

export function LateShiftReceipts({ receipts, restaurant }: {
  receipts: LateShiftReceipt[]; restaurant: Restaurant;
}) {
  if (!receipts.length) return null;
  return <section className="my-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
    <h2 className="font-black">Offline payments received after shift closure</h2>
    <p className="mt-2 text-sm">These payments belong to the original shifts below. Their frozen close reports
      have not been rewritten. Keep this addendum with those reports when reconciling the difference;
      do not record the same payments as new sales in another shift.</p>
    <p className="mt-1 text-xs">Latest {receipts.length} receipts (up to 100). Amounts were already collected before synchronization.</p>
    <ul className="mt-3 space-y-2">{receipts.map(receipt => <li key={receipt.id} className="text-sm">
      <span className="font-bold">{receipt.id.slice(0, 8)} · {formatCurrency(Number(receipt.total), restaurant)}</span>
      {" · "}{receipt.payment_method}{" · Synced "}{formatRestaurantShortDateTime(receipt.created_at, restaurant)}
      {receipt.punched_at ? <> · Collected {formatRestaurantShortDateTime(receipt.punched_at, restaurant)}</> : null}
      {" · "}<Link className="underline" href={`/admin/shifts/${receipt.shift_id}/report`}>Original shift report</Link>
    </li>)}</ul>
  </section>;
}
