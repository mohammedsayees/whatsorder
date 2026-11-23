import type { Metadata } from "next";
import { GiveRiderCashForm, ReceiveRiderCashForm } from "@/components/admin/RiderCashForms";
import { formatCurrency } from "@/lib/currency";
import { formatRestaurantShortDateTime } from "@/lib/date-time";
import {
  getRecentRiderCashEntries,
  getRiderReport,
  resolveRiderReportRange
} from "@/lib/rider-cash-data";
import { RIDER_CASH_ENTRY_LABELS } from "@/lib/rider-cash";
import { getDeliveryRiders } from "@/lib/rider-data";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Riders" };

export default async function AdminRidersPage({
  searchParams
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const [session, query] = await Promise.all([requireRestaurantAdmin(), searchParams]);
  const restaurant = session.restaurant;
  const money = (value: number) => formatCurrency(value, restaurant);
  const range = resolveRiderReportRange(query.from, query.to, restaurant);
  const riders = await getDeliveryRiders(session.restaurantId);
  const [report, entries] = await Promise.all([
    getRiderReport(session.restaurantId, riders, range),
    getRecentRiderCashEntries(session.restaurantId)
  ]);
  const riderNames = new Map(riders.map((rider) => [rider.id, rider.name]));
  const holders = report.rows.filter((row) => row.balance !== 0);
  const totalHeld = holders.reduce((sum, row) => sum + Math.round(row.balance * 100), 0) / 100;
  // Inactive riders stay listed while they still hold cash, so they can be settled.
  const activeRiders = riders.filter(
    (rider) => rider.is_active || holders.some((row) => row.rider.id === rider.id)
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 lg:px-8">
      <p className="text-sm font-bold uppercase tracking-wide text-leaf">Delivery</p>
      <h1 className="text-3xl font-black">Riders &amp; rider cash</h1>
      <p className="mt-2 max-w-3xl text-stone-600">
        Cash a rider holds is what you gave them for change plus the cash they collected, minus what they handed back.
        The shift cannot be closed until every rider is settled.
      </p>

      <section aria-label="Cash held by riders" className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-black">Cash with riders now</h2>
          <p className={`text-2xl font-black ${totalHeld === 0 ? "text-leaf" : "text-amber-700"}`}>{money(totalHeld)}</p>
        </div>
        {activeRiders.length === 0 ? (
          <p className="mt-3 text-sm text-stone-600">No active riders. Add riders in Settings first.</p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {activeRiders.map((rider) => {
              const row = report.rows.find((candidate) => candidate.rider.id === rider.id);
              const balance = row?.balance ?? 0;

              return (
                <article className="rounded-lg border border-stone-200 p-4" key={rider.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black">{rider.name}</p>
                      <p className="text-xs text-stone-500">{rider.phone}</p>
                    </div>
                    <p
                      className={`rounded-full px-3 py-1 text-sm font-black ${balance === 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-100 text-amber-900"}`}
                    >
                      {balance === 0 ? "Settled" : `Holds ${money(balance)}`}
                    </p>
                  </div>
                  <div className="mt-3 grid gap-3">
                    <GiveRiderCashForm riderId={rider.id} riderName={rider.name} />
                    <ReceiveRiderCashForm holds={money(balance)} riderId={rider.id} riderName={rider.name} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section aria-label="Rider report" className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-black">Rider report</h2>
          <form className="flex flex-wrap items-end gap-2" method="get">
            <label className="text-xs font-bold">
              From
              <input className="focus-ring mt-1 block rounded-lg border border-stone-200 px-3 py-2 text-sm" defaultValue={range.fromKey} name="from" type="date" />
            </label>
            <label className="text-xs font-bold">
              To
              <input className="focus-ring mt-1 block rounded-lg border border-stone-200 px-3 py-2 text-sm" defaultValue={range.toKey} name="to" type="date" />
            </label>
            <button className="focus-ring rounded-lg bg-stone-900 px-4 py-2 text-sm font-black text-white" type="submit">
              Show
            </button>
          </form>
        </div>
        {report.truncated ? (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-900">
            Showing the most recent deliveries only. Choose a shorter range for exact totals.
          </p>
        ) : null}
        {report.rows.length === 0 ? (
          <p className="mt-4 text-sm text-stone-600">No rider activity in this period.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="py-2 pr-3">Rider</th>
                  <th className="py-2 pr-3">Delivered</th>
                  <th className="py-2 pr-3">Not delivered</th>
                  <th className="py-2 pr-3">Cash collected</th>
                  <th className="py-2 pr-3">Card collected</th>
                  <th className="py-2 pr-3">Prepaid / other</th>
                  <th className="py-2 pr-3">Avg time</th>
                  <th className="py-2 pr-3">Handed over</th>
                  <th className="py-2 pr-3">Differences</th>
                  <th className="py-2">Holds now</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {report.rows.map((row) => (
                  <tr key={row.rider.id}>
                    <td className="py-2 pr-3 font-black">{row.rider.name}</td>
                    <td className="py-2 pr-3">{row.delivered}</td>
                    <td className="py-2 pr-3">{row.failed || "–"}</td>
                    <td className="py-2 pr-3">{money(row.cashValue)}</td>
                    <td className="py-2 pr-3">{money(row.cardValue)}</td>
                    <td className="py-2 pr-3">{money(row.otherValue)}</td>
                    <td className="py-2 pr-3">{row.avgMinutes === null ? "–" : `${row.avgMinutes} min`}</td>
                    <td className="py-2 pr-3">{money(row.cashHandedOver)}</td>
                    <td className={`py-2 pr-3 font-bold ${row.variance < 0 ? "text-rose-700" : row.variance > 0 ? "text-amber-800" : ""}`}>
                      {row.variance === 0 ? "–" : `${row.variance < 0 ? "Short " : "Over "}${money(Math.abs(row.variance))}`}
                    </td>
                    <td className="py-2 font-black">{money(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-stone-500">
          Avg time runs from assigning the rider to the rider tapping Delivered.
        </p>
      </section>

      <section aria-label="Recent cash activity" className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black">Recent rider cash activity</h2>
        {entries.length === 0 ? (
          <p className="mt-3 text-sm text-stone-600">Nothing recorded yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-100">
            {entries.map((entry) => (
              <li className="flex items-start justify-between gap-3 py-2 text-sm" key={entry.id}>
                <div className="min-w-0">
                  <p className="font-bold">
                    {riderNames.get(entry.rider_id) ?? "Rider"} · {RIDER_CASH_ENTRY_LABELS[entry.entry_type]}
                  </p>
                  <p className="text-xs text-stone-500">
                    {formatRestaurantShortDateTime(entry.created_at, restaurant)}
                    {entry.actor_role ? ` · ${entry.actor_role.replace("_", " ")}` : ""}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </p>
                </div>
                <p className={`shrink-0 font-black ${entry.amount < 0 ? "text-stone-700" : "text-leaf"}`}>
                  {entry.amount < 0 ? "−" : "+"}
                  {money(Math.abs(entry.amount))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
