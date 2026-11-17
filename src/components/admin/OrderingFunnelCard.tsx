import type { buildFunnel, FunnelStepKey } from "@/lib/customer-funnel";

const STEP_LABELS: Record<FunnelStepKey, string> = {
  menu_view: "Opened the menu",
  item_added: "Added an item",
  search_used: "Searched",
  checkout_view: "Reached checkout",
  checkout_blocked: "Blocked at checkout",
  order_saved: "Saved an order",
  whatsapp_opened: "Tapped send on WhatsApp",
  order_accepted: "Accepted by you"
};

/**
 * Where online customers drop off, for the selected date range. Counts are
 * visits (one browser tab session), not unique people.
 */
export function OrderingFunnelCard({
  funnel
}: {
  funnel: ReturnType<typeof buildFunnel> | null;
}) {
  const top = funnel?.steps[0]?.sessions ?? 0;

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-black">Online ordering funnel</h2>
          <p className="mt-1 text-sm text-stone-500">
            Customer visits to your ordering link in this period, step by step.
          </p>
        </div>
        {funnel && top > 0 ? (
          <p className="text-sm text-stone-500">
            {funnel.searchSessions} used search · {funnel.blockedSessions} blocked at checkout
          </p>
        ) : null}
      </div>

      {!funnel ? (
        <p className="mt-4 rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-600">
          Funnel data is unavailable right now. Please refresh in a moment.
        </p>
      ) : top === 0 ? (
        <p className="mt-4 rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-600">
          No visits recorded in this period yet. Visits are counted from the day this report was
          switched on.
        </p>
      ) : (
        <ol className="mt-4 space-y-3">
          {funnel.steps.map((step) => (
            <li key={step.event}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-bold">{STEP_LABELS[step.event]}</span>
                <span>
                  <span className="font-black">{step.sessions}</span>
                  {step.continuedPercent !== null ? (
                    <span className="ms-2 text-stone-500">
                      {step.continuedPercent}%
                      {step.event === "order_accepted" ? " of saved" : " continued"}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-leaf"
                  style={{ width: `${Math.min(100, (step.sessions / top) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
