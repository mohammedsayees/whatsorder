import { Sparkles } from "lucide-react";

import type { DailySummaryCardData } from "@/lib/data";
import { formatCurrency } from "@/lib/currency";
import type { DailyCoachPeriodStatus } from "@/lib/daily-summary/types";
import type { Restaurant } from "@/lib/types";

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
const statusLabels: Record<DailyCoachPeriodStatus, string> = {
  growing: "Growing",
  normal: "Normal",
  needs_attention: "Needs attention",
  insufficient_data: "More data needed"
};

const statusClasses: Record<DailyCoachPeriodStatus, string> = {
  growing: "bg-emerald-100 text-emerald-800",
  normal: "bg-stone-100 text-stone-700",
  needs_attention: "bg-amber-100 text-amber-800",
  insufficient_data: "bg-sky-50 text-sky-700"
};

export function DailySummaryCard({
  restaurant,
  summary
}: {
  restaurant: Restaurant;
  summary: DailySummaryCardData;
}) {
  const periods = summary.numbers?.coach?.periods ?? [];

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
          {periods.length > 0 ? (
            <details className="mt-4 border-t border-stone-100 pt-4">
              <summary className="focus-ring cursor-pointer rounded text-sm font-black text-leaf">
                View all trading periods
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {periods.map((period) => (
                  <section
                    className="rounded-lg border border-stone-200 bg-stone-50 p-3"
                    key={period.key}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-black">{period.label}</h3>
                        <p className="text-xs font-semibold text-stone-500">
                          {String(period.start_hour).padStart(2, "0")}:00–
                          {period.end_hour === 24
                            ? "00:00"
                            : `${String(period.end_hour).padStart(2, "0")}:00`}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${statusClasses[period.status]}`}
                      >
                        {statusLabels[period.status]}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-bold">
                      {period.order_count} completed · {formatCurrency(period.sales, restaurant)}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-stone-600">
                      {period.evidence}
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-relaxed text-ink">
                      {period.action}
                    </p>
                  </section>
                ))}
              </div>
              <p className="mt-3 text-xs text-stone-500">
                Period comparisons use completed orders from the same weekday over the previous four weeks. Delivery areas appear only with at least three orders.
              </p>
            </details>
          ) : null}
        </div>
      </div>
    </article>
  );
}
