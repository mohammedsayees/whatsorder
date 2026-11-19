import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { SubscriptionStatus } from "@/lib/billing";
import { autopayFailureReason } from "@/lib/owner-billing";

// Non-destructive billing notice for the staff dashboard. past_due shows an
// amber warning (no loss of function); suspended shows a red "paused" notice.
// Customer ordering is never affected by this banner.
export function BillingBanner({
  autopayFailure = null,
  billingHref,
  status
}: {
  /** Decline code of the latest failed autopay charge (owners only). */
  autopayFailure?: string | null;
  /** Set for roles that can open /admin/billing; staff get no link. */
  billingHref?: string | null;
  status: SubscriptionStatus | null;
}) {
  if (status !== "past_due" && status !== "suspended") {
    if (!autopayFailure) {
      return null;
    }
    return (
      <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 print:hidden">
        <AlertTriangle className="mt-0.5 shrink-0" size={16} />
        <p>
          Autopay couldn&apos;t pay your WhatsOrder invoice: {autopayFailureReason(autopayFailure)}.
          {billingHref ? (
            <>
              {" "}
              <Link className="underline" href={billingHref}>
                Update your card or pay now
              </Link>
            </>
          ) : null}
        </p>
      </div>
    );
  }

  const isSuspended = status === "suspended";
  const tone = isSuspended
    ? "border-red-200 bg-red-50 text-red-800"
    : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <div className={`flex items-start gap-2 border-b px-4 py-3 text-sm font-bold print:hidden ${tone}`}>
      <AlertTriangle className="mt-0.5 shrink-0" size={16} />
      <p>
        {isSuspended
          ? "Subscription paused — management features are limited. Settle the outstanding invoice to restore full access. Your customer ordering page stays live."
          : "Payment overdue — please settle your latest invoice to avoid interruption to management features. Your customer ordering page is unaffected."}
        {autopayFailure ? ` Autopay couldn't pay it: ${autopayFailureReason(autopayFailure)}.` : ""}
        {billingHref ? (
          <>
            {" "}
            <Link className="underline" href={billingHref}>
              View invoice and pay
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}
