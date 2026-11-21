import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import {
  AED_PER_USD,
  formatUsd,
  type RestaurantAiUsage
} from "@/lib/ai/usage-data";

function Cost({ usd }: { usd: number }) {
  return (
    <span>
      {formatUsd(usd)}
      <span className="ml-1 text-xs font-normal text-stone-500">
        ≈ AED {(usd * AED_PER_USD).toFixed(2)}
      </span>
    </span>
  );
}

/**
 * Estimated AI cost per restaurant (list prices, from ai_usage_events).
 * Server component: no client JavaScript.
 */
export function AiUsagePanel({
  usage,
  days,
  restaurantNames,
  showRestaurant = true
}: {
  usage: RestaurantAiUsage[];
  days: number;
  restaurantNames?: Map<string, string>;
  showRestaurant?: boolean;
}) {
  const totalUsd = usage.reduce((sum, entry) => sum + entry.costUsd, 0);
  const totalCalls = usage.reduce((sum, entry) => sum + entry.calls, 0);
  const unpriced = usage.reduce((sum, entry) => sum + entry.unpricedCalls, 0);

  return (
    <section className="mt-5 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-200 px-5 py-4">
        <h2 className="flex items-center gap-2 text-lg font-black">
          <Sparkles className="text-leaf" size={18} />
          AI cost · last {days} days
        </h2>
        <p className="text-sm text-stone-600">
          {totalCalls} call{totalCalls === 1 ? "" : "s"} ·{" "}
          <strong className="text-ink">
            <Cost usd={totalUsd} />
          </strong>
        </p>
      </header>

      {usage.length === 0 ? (
        <p className="px-5 py-8 text-center text-stone-500">No AI usage recorded in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase text-stone-500">
              <tr>
                {showRestaurant ? <th className="px-5 py-3 font-black">Restaurant</th> : null}
                <th className="px-5 py-3 font-black">Calls</th>
                <th className="px-5 py-3 font-black">Estimated cost</th>
                <th className="px-5 py-3 font-black">By feature</th>
                {showRestaurant ? <th className="px-5 py-3" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {usage.map((entry) => (
                <tr key={entry.restaurantId ?? "unattributed"} className="align-top hover:bg-stone-50">
                  {showRestaurant ? (
                    <td className="px-5 py-3 font-bold">
                      {entry.restaurantId
                        ? restaurantNames?.get(entry.restaurantId) ?? "Deleted restaurant"
                        : <span className="font-normal text-stone-500">Before sign-up (/try demo)</span>}
                    </td>
                  ) : null}
                  <td className="px-5 py-3">{entry.calls}</td>
                  <td className="px-5 py-3 font-bold">
                    <Cost usd={entry.costUsd} />
                    {entry.unpricedCalls > 0 ? (
                      <span className="block text-xs font-normal text-amber-700">
                        +{entry.unpricedCalls} call{entry.unpricedCalls === 1 ? "" : "s"} on an unpriced model
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-stone-600">
                    <ul className="space-y-0.5">
                      {entry.features.map((feature) => (
                        <li key={feature.feature}>
                          {feature.label}: {feature.calls} · {formatUsd(feature.costUsd)}
                        </li>
                      ))}
                    </ul>
                  </td>
                  {showRestaurant ? (
                    <td className="px-5 py-3 text-right">
                      {entry.restaurantId ? (
                        <Link
                          className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-black text-leaf hover:bg-mint"
                          href={`/super-admin/billing/${entry.restaurantId}`}
                        >
                          Billing <ArrowRight size={15} />
                        </Link>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-stone-100 px-5 py-3 text-xs text-stone-500">
        Estimated from Google&apos;s token counts at list prices (src/lib/ai/usage.ts); your Google
        AI Studio bill is the source of truth.
        {unpriced > 0 ? " Calls on an unpriced model are counted but not costed." : ""}
      </p>
    </section>
  );
}
