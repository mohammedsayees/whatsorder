import { Sparkles } from "lucide-react";

import type { DailySummaryCardData } from "@/lib/data";

function formatDay(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return parsed.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });
}

/**
 * Surfaces the most recent daily insight recap on the dashboard. This is the
 * delivery surface for the Daily Insight Job until a WhatsApp outbound path
 * exists. message_text is the deterministic/narrated owner message; we render it
 * as-is (the figures inside are produced server-side, never by this component).
 */
export function DailySummaryCard({ summary }: { summary: DailySummaryCardData }) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-mint text-leaf">
          <Sparkles size={19} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-stone-500">Daily recap</p>
          <p className="text-xs font-semibold text-stone-400">{formatDay(summary.summary_date)}</p>
          <p className="mt-3 whitespace-pre-line text-sm font-medium leading-relaxed text-ink">
            {summary.message_text?.trim() || "No recap available for this day yet."}
          </p>
        </div>
      </div>
    </article>
  );
}
