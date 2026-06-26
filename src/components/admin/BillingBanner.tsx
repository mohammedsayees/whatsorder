import { AlertTriangle } from "lucide-react";
import type { SubscriptionStatus } from "@/lib/billing";

// Non-destructive billing notice for the staff dashboard. past_due shows an
// amber warning (no loss of function); suspended shows a red "paused" notice.
// Customer ordering is never affected by this banner.
export function BillingBanner({ status }: { status: SubscriptionStatus | null }) {
  if (status !== "past_due" && status !== "suspended") {
    return null;
  }

  const isSuspended = status === "suspended";
  const tone = isSuspended
    ? "border-red-200 bg-red-50 text-red-800"
    : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <div className={`flex items-start gap-2 border-b px-4 py-3 text-sm font-bold ${tone}`}>
      <AlertTriangle className="mt-0.5 shrink-0" size={16} />
      <p>
        {isSuspended
          ? "Subscription paused — management features are limited. Settle the outstanding invoice to restore full access. Your customer ordering page stays live."
          : "Payment overdue — please settle your latest invoice to avoid interruption to management features. Your customer ordering page is unaffected."}
      </p>
    </div>
  );
}
