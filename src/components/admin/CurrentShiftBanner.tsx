import Link from "next/link";
import { AlertTriangle, WalletCards } from "lucide-react";
import { formatAED } from "@/lib/currency";
import type { CurrentShiftView } from "@/lib/shift-data";

export function CurrentShiftBanner({
  currentShift
}: {
  currentShift: CurrentShiftView | null;
}) {
  if (!currentShift) {
    return (
      <div className="mt-5 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 shrink-0" size={20} />
          <div>
            <p className="font-black">No shift is open</p>
            <p className="text-sm">
              Completed orders will remain unassigned until a shift is opened.
            </p>
          </div>
        </div>
        <Link
          className="focus-ring rounded-lg bg-amber-900 px-4 py-2 text-center text-sm font-black text-white"
          href="/admin/shifts"
        >
          Open shift
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-5 flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <WalletCards className="mt-0.5 shrink-0" size={20} />
        <div>
          <p className="font-black">Current shift: {currentShift.shift.shift_name}</p>
          <p className="text-sm">
            {currentShift.summary.completed_order_count} completed · Expected cash{" "}
            <span className="font-black">
              {formatAED(currentShift.summary.expected_cash_amount)}
            </span>
          </p>
        </div>
      </div>
      <Link
        className="focus-ring rounded-lg border border-emerald-700 px-4 py-2 text-center text-sm font-black text-emerald-800"
        href="/admin/shifts"
      >
        View shift
      </Link>
    </div>
  );
}
