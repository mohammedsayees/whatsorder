import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { billingDateString } from "@/lib/billing";
import { getOwnerSubscription } from "@/lib/billing-data";
import {
  BILLING_PAGE_HREF,
  buildTrialConversionPreview,
  firstInvoiceSentence,
  shouldShowTrialNotice,
  trialEndHeadline,
  trialPlanSentence
} from "@/lib/owner-billing";

// Dashboard notice for the last TRIAL_NOTICE_DAYS of a free trial. Render it
// only for roles that can open the billing page. A billing read failure hides
// the notice rather than breaking the dashboard.
export async function TrialEndingNotice({ restaurantId }: { restaurantId: string }) {
  let preview = null;
  try {
    const { subscription, plan } = await getOwnerSubscription(restaurantId);
    preview =
      subscription && plan
        ? buildTrialConversionPreview({ subscription, plan, today: billingDateString() })
        : null;
  } catch (error) {
    console.error(
      "WhatsOrder billing: trial notice unavailable",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
  if (!preview || !shouldShowTrialNotice(preview)) {
    return null;
  }

  return (
    <section className="mt-5 rounded-lg border border-sky-200 bg-sky-50 px-5 py-4 text-sky-950">
      <h2 className="flex items-center gap-2 font-black">
        <CalendarClock size={18} />
        {trialEndHeadline(preview)}
      </h2>
      <p className="mt-1 text-sm">
        {trialPlanSentence(preview)} {firstInvoiceSentence(preview)}
      </p>
      <Link className="mt-2 inline-block text-sm font-bold underline" href={BILLING_PAGE_HREF}>
        View plan and billing
      </Link>
    </section>
  );
}
