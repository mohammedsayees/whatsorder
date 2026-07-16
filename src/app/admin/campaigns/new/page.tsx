import Link from "next/link";
import { ArrowLeft, Megaphone } from "lucide-react";
import { SEGMENT_TABS, isSegmentFilter } from "@/lib/customer-insights";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

// Placeholder for Phase 2 campaign drafts. It intentionally does NOT send any
// WhatsApp messages or integrate the WhatsApp API — it only confirms which
// segment the owner picked so the "Create campaign from this segment" flow has
// somewhere to land today.
export default async function NewCampaignPage({
  searchParams
}: {
  searchParams: Promise<{ segment?: string; q?: string }>;
}) {
  const [, { segment, q }] = await Promise.all([
    requireRestaurantRole(["restaurant_admin", "owner", "manager"]),
    searchParams
  ]);
  const activeSegment = isSegmentFilter(segment) ? segment : "all";
  const segmentLabel =
    SEGMENT_TABS.find((tab) => tab.value === activeSegment)?.label ?? "All customers";
  const backHref = `/admin/customers?segment=${activeSegment}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <Link
        className="focus-ring inline-flex items-center gap-2 text-sm font-black text-stone-600 hover:text-ink"
        href={backHref}
      >
        <ArrowLeft size={16} />
        Back to customers
      </Link>

      <div className="mt-6 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-mint/20 text-leaf">
            <Megaphone size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-black">Create a campaign</h1>
            <p className="text-sm text-stone-500">Segment: {segmentLabel}</p>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-sm leading-6 text-amber-950">
          <p className="font-black">Campaign drafts are coming next.</p>
          <p className="mt-1">
            You picked the <span className="font-black">{segmentLabel}</span> segment. Soon you will
            be able to write one message and send it to everyone in this group who can be contacted
            on WhatsApp. Sending is not switched on yet.
          </p>
        </div>

        <p className="mt-4 text-sm leading-6 text-stone-500">
          For now you can still message customers one at a time from the customers page. Every
          promotional message stays off unless the customer has opted in, and each message keeps the
          STOP / unsubscribe line.
        </p>
      </div>
    </main>
  );
}
