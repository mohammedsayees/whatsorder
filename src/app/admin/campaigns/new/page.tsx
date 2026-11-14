import Link from "next/link";
import { ArrowLeft, Megaphone } from "lucide-react";

import { CampaignSendForm } from "@/components/admin/CampaignSendForm";
import { MarketingTabs } from "@/components/admin/MarketingTabs";
import { SEGMENT_TABS, isSegmentFilter } from "@/lib/customer-insights";
import { CAMPAIGN_CHANNELS, getCampaignBreakdown } from "@/lib/marketing/campaign";
import { getPosterHistory } from "@/lib/poster/store";
import { requirePlanFeature } from "@/lib/plan-gates";
import { requireRestaurantRole } from "@/lib/super-admin-auth";
import { posterSendAvailability } from "@/lib/marketing/send-availability";

export const dynamic = "force-dynamic";
// The campaign send action runs inside this page's request (40 s send budget).
export const maxDuration = 60;

const TEMPLATE_LABELS: Record<string, string> = {
  bestseller: "Bestseller",
  offer: "Offer",
  new_item: "New item",
  loyalty: "Loyalty",
  festival: "Festival"
};

export default async function NewCampaignPage({
  searchParams
}: {
  searchParams: Promise<{ segment?: string; q?: string; poster?: string }>;
}) {
  const [session, query] = await Promise.all([
    requireRestaurantRole(["restaurant_admin", "owner", "manager"]),
    searchParams
  ]);
  await requirePlanFeature(session.restaurantId, "campaigns");
  const activeSegment = isSegmentFilter(query.segment) ? query.segment : "marketing_opt_in";
  const segmentLabel =
    SEGMENT_TABS.find((tab) => tab.value === activeSegment)?.label ?? "All customers";

  const sendAvailability = await posterSendAvailability(session.restaurantId);
  const ownsCloudNumber = sendAvailability.ok;
  const [breakdown, history] = await Promise.all([
    ownsCloudNumber ? getCampaignBreakdown(session.restaurantId, activeSegment) : Promise.resolve(null),
    getPosterHistory(session.restaurantId, 12)
  ]);
  const blockedReason = !sendAvailability.ok
    ? sendAvailability.reason
    : breakdown?.readFailed
      ? "Couldn't check who can be reached right now. Try again shortly."
      : null;

  const reasons = breakdown
    ? [
        { label: "Not opted in to offers", value: breakdown.notOptedIn, hint: "They haven't agreed to marketing messages, or opted out." },
        { label: "No open chat window", value: breakdown.noOpenWindow, hint: "Free messages need the customer to have messaged you in the last 24 hours." },
        { label: "Got a marketing message today", value: breakdown.frequencyCapped, hint: "At most one marketing message per customer per 24 hours." }
      ]
    : [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <MarketingTabs active="campaigns" />
      <Link
        className="focus-ring mt-4 inline-flex items-center gap-2 text-sm font-black text-stone-600 hover:text-ink"
        href={`/admin/customers?segment=${activeSegment}${query.q ? `&q=${encodeURIComponent(query.q)}` : ""}`}
      >
        <ArrowLeft size={16} />
        Back to customers
      </Link>

      <div className="mt-4 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-mint text-leaf">
            <Megaphone size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-black">Send a campaign</h1>
            <p className="text-sm text-stone-500">One poster to one group of customers.</p>
          </div>
        </div>

        <div className="mt-5">
          <p className="text-sm font-black uppercase tracking-wide text-stone-500">Segment</p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {SEGMENT_TABS.map((tab) => (
              <Link
                className={`focus-ring shrink-0 rounded-full border px-3 py-1.5 text-sm font-bold ${
                  tab.value === activeSegment ? "border-leaf bg-leaf text-white" : "border-stone-200 bg-white text-ink hover:border-leaf"
                }`}
                href={`/admin/campaigns/new?segment=${tab.value}${query.poster ? `&poster=${encodeURIComponent(query.poster)}` : ""}`}
                key={tab.value}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>

        {breakdown && !breakdown.readFailed ? (
          <div className="mt-5 rounded-lg border border-stone-200 p-4">
            <p className="text-sm">
              <span className="font-black">{segmentLabel}</span>: {breakdown.segmentSize} customer
              {breakdown.segmentSize === 1 ? "" : "s"}
              {breakdown.truncated ? " (showing the first part of a very large segment)" : ""}.
            </p>
            <p className="mt-2 text-2xl font-black text-leaf">
              {breakdown.reachable.length} reachable now
            </p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {reasons.map((reason) => (
                <li className="flex items-start justify-between gap-4" key={reason.label}>
                  <span>
                    <span className="font-bold">{reason.label}</span>
                    <span className="block text-xs text-stone-500">{reason.hint}</span>
                  </span>
                  <span className="font-black">{reason.value}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6">
          <CampaignSendForm
            blockedReason={blockedReason}
            channels={Object.entries(CAMPAIGN_CHANNELS).map(([id, channel]) => ({ id, ...channel }))}
            initialPosterId={query.poster ?? null}
            posters={history.map((entry) => ({
              id: entry.id,
              label: `${TEMPLATE_LABELS[entry.template_id] ?? entry.template_id} · ${entry.copy?.headline ?? ""}`,
              previewUrl: entry.previewUrl,
              format: entry.copy?.format ?? "story"
            }))}
            reachable={breakdown?.reachable.length ?? 0}
            segment={activeSegment}
          />
        </div>
      </div>
    </main>
  );
}
