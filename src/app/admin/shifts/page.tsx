import { AlertTriangle, Banknote, CalendarCheck, CircleDollarSign, CreditCard, QrCode, ReceiptText, WalletCards } from "lucide-react";
import Link from "next/link";
import {
  AssignUnassignedOrdersButton,
  CloseShiftForm,
  CloseBusinessDayButton,
  OpenShiftForm,
  OtherIncomeForm,
  PaidOutForm,
  VoidOtherIncomeForm
} from "@/components/admin/ShiftForms";
import { otherIncomeCategoryLabels, otherIncomePaymentLabels } from "@/lib/business-day";
import { getOpenBusinessDay, getPreviousBusinessDays } from "@/lib/business-day-data";
import { formatCurrency } from "@/lib/currency";
import { formatRestaurantShortDateTime } from "@/lib/date-time";
import {
  getCurrentShiftView,
  getPreviousShifts,
  getUnassignedCompletedOrderCount
} from "@/lib/shift-data";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";
import { configuredMarketplaceChannels } from "@/lib/shift-reconciliation";

function formatShiftDuration(openedAt: string, closedAt: string | null) {
  if (!closedAt) {
    return "";
  }
  const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) {
    return "";
  }
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`;
}

const fulfilmentLabels: Record<string, string> = {
  car_pickup: "Bring to My Car",
  delivery: "Delivery",
  dine_in: "Dine-in",
  takeaway: "Takeaway"
};

export default async function AdminShiftsPage() {
  const session = await requireRestaurantAdmin();
  const money = (value: number) => formatCurrency(value, session.restaurant);
  const formatDateTime = (value: string | Date) =>
    formatRestaurantShortDateTime(value, session.restaurant);
  const [currentShift, previousShifts, unassignedCompletedOrders, openBusinessDay, previousBusinessDays] =
    await Promise.all([
      getCurrentShiftView(session),
      getPreviousShifts(session),
      getUnassignedCompletedOrderCount(session.restaurantId),
      getOpenBusinessDay(session),
      getPreviousBusinessDays(session)
    ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-leaf">
          Shift operations
        </p>
        <h1 className="text-3xl font-black">Shift Reconciliation</h1>
        <p className="mt-2 max-w-3xl text-stone-600">
          Check cash, card, UPI and enabled delivery-platform totals, then create
          a printable close report. This is an operational summary, not an accounting ledger.
        </p>
      </div>

      {openBusinessDay ? (
        <section className="mt-5 rounded-lg border border-sky-200 bg-sky-50 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CalendarCheck className="mt-0.5 shrink-0 text-sky-700" size={21} />
              <div>
                <p className="font-black text-sky-950">Business day {openBusinessDay.day.business_date}</p>
                <p className="mt-1 text-sm text-sky-800">
                  {openBusinessDay.shifts.length} shift{openBusinessDay.shifts.length === 1 ? "" : "s"} attached. It remains the same operating day even after midnight.
                </p>
              </div>
            </div>
            {!currentShift && session.role !== "staff" && openBusinessDay.shifts.length > 0 ? (
              <div className="w-full sm:w-72">
                <CloseBusinessDayButton businessDayId={openBusinessDay.day.id} />
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {unassignedCompletedOrders > 0 ? (
        <div className="mt-5 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <AlertTriangle className="mt-0.5 shrink-0" size={20} />
          <div className="flex-1">
            <p className="font-black">
              {unassignedCompletedOrders} completed order
              {unassignedCompletedOrders === 1 ? "" : "s"} unassigned
            </p>
            <p className="text-sm">
              These orders were completed while no shift was open. They are not
              included in a shift&apos;s expected cash.
            </p>
            {currentShift ? (
              <div className="mt-3">
                <AssignUnassignedOrdersButton />
              </div>
            ) : (
              <p className="mt-2 text-xs font-bold">
                Open a shift to assign these orders to it.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {!currentShift ? (
        <section className="mt-6 max-w-xl rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-mint text-leaf">
              <WalletCards size={22} />
            </span>
            <div>
              <h2 className="text-xl font-black">Open a shift</h2>
              <p className="text-sm text-stone-500">
                Only one shift can be open for this restaurant.
              </p>
            </div>
          </div>
          <OpenShiftForm restaurant={session.restaurant} />
        </section>
      ) : (
        <>
          <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-emerald-800">
                  Open
                </span>
                <h2 className="mt-3 text-2xl font-black">
                  {currentShift.shift.shift_name}
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  Opened {formatDateTime(currentShift.shift.opened_at)}
                  {currentShift.shift.opened_by_user_id === session.userId
                    ? " by you"
                    : " by another team member"}
                </p>
                {currentShift.shift.opening_note ? (
                  <p className="mt-3 rounded-lg bg-stone-50 p-3 text-sm text-stone-600">
                    {currentShift.shift.opening_note}
                  </p>
                ) : null}
              </div>
              {!currentShift.canManage ? (
                <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm font-bold text-stone-600">
                  Only the opener or a manager can record paid-outs and close
                  this shift.
                </p>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: WalletCards,
                  label: "Opening cash",
                  value: money(Number(currentShift.shift.opening_cash_amount))
                },
                {
                  icon: Banknote,
                  label: "Completed cash orders",
                  value: money(currentShift.summary.completed_cash_order_total)
                },
                {
                  icon: ReceiptText,
                  label: "Cash paid-outs",
                  value: money(currentShift.summary.cash_paid_out_total)
                },
                {
                  icon: CircleDollarSign,
                  label: "Other income",
                  value: money(currentShift.summary.other_income_total)
                },
                {
                  icon: CreditCard,
                  label: "Card on delivery",
                  value: money(currentShift.summary.card_on_delivery_total)
                },
                ...(session.restaurant.country_code === "IN"
                  ? [{
                      icon: QrCode,
                      label: "UPI",
                      value: money(currentShift.summary.upi_total)
                    }]
                  : [])
              ].map(({ icon: Icon, label, value }) => (
                <div className="rounded-lg bg-stone-50 p-4" key={label}>
                  <Icon className="text-leaf" size={18} />
                  <p className="mt-3 text-xs font-bold uppercase tracking-wide text-stone-500">
                    {label}
                  </p>
                  <p className="mt-1 text-xl font-black">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-bold text-emerald-800">
                  Expected cash
                </p>
                <p className="mt-1 text-3xl font-black text-emerald-950">
                  {money(currentShift.summary.expected_cash_amount)}
                </p>
                <p className="mt-2 text-xs font-semibold text-emerald-800">
                  Opening cash + cash order sales + cash other income − cash paid-outs
                </p>
              </div>
              <div className="rounded-lg border border-stone-200 p-4">
                <p className="text-sm font-black">Shift activity</p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-stone-500">Completed orders</dt>
                    <dd className="font-black">
                      {currentShift.summary.completed_order_count}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">Completed sales</dt>
                    <dd className="font-black">
                      {money(currentShift.summary.completed_sales)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">Cancelled in window</dt>
                    <dd className="font-black">
                      {currentShift.summary.cancelled_order_count}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 border-t border-stone-100 pt-3 text-sm">
                  {Object.entries(
                    currentShift.summary.fulfilment_breakdown
                  ).map(([type, values]) => (
                    <p
                      className="flex justify-between gap-3 py-1"
                      key={type}
                    >
                      <span className="text-stone-500">
                        {fulfilmentLabels[type] ?? type}
                      </span>
                      <span className="font-bold">
                        {values?.orders ?? 0} ·{" "}
                        {money(Number(values?.sales ?? 0))}
                      </span>
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black">Cash paid-outs</h2>
              <p className="mt-1 text-sm text-stone-500">
                Record only cash physically taken from this shift.
              </p>
              {currentShift.canManage ? (
                <div className="mt-4">
                  <PaidOutForm restaurant={session.restaurant} shiftId={currentShift.shift.id} />
                </div>
              ) : null}
              <div className="mt-5 space-y-2">
                {currentShift.paidOuts.length > 0 ? (
                  currentShift.paidOuts.map((paidOut) => (
                    <div
                      className="flex items-start justify-between gap-3 rounded-lg bg-stone-50 p-3"
                      key={paidOut.id}
                    >
                      <div>
                        <p className="font-bold">{paidOut.reason}</p>
                        <p className="text-xs text-stone-500">
                          {formatDateTime(paidOut.recorded_at)}
                        </p>
                      </div>
                      <p className="shrink-0 font-black text-rose-700">
                        −{money(Number(paidOut.amount))}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg border border-dashed border-stone-200 p-5 text-center text-sm text-stone-500">
                    No cash paid-outs recorded.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black">Other income</h2>
              <p className="mt-1 text-sm text-stone-500">
                Record receipts that are not customer-order sales. Cash entries increase expected drawer cash.
              </p>
              {currentShift.canManage ? (
                <div className="mt-4">
                  <OtherIncomeForm restaurant={session.restaurant} shiftId={currentShift.shift.id} />
                </div>
              ) : null}
              <div className="mt-5 space-y-2">
                {currentShift.otherIncomeEntries.length ? currentShift.otherIncomeEntries.map((entry) => (
                  <div className="rounded-lg bg-stone-50 p-3" key={entry.id}>
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-bold">{otherIncomeCategoryLabels[entry.category]}</p>
                        <p className="text-xs text-stone-500">{entry.description}</p>
                        <p className="mt-1 text-xs text-stone-500">
                          {otherIncomePaymentLabels[entry.payment_method]} · {formatDateTime(entry.recorded_at)}
                          {entry.reference ? ` · ${entry.reference}` : ""}
                        </p>
                        {currentShift.canManage ? <VoidOtherIncomeForm entryId={entry.id} shiftId={currentShift.shift.id} /> : null}
                      </div>
                      <p className="shrink-0 font-black text-emerald-700">+{money(Number(entry.amount))}</p>
                    </div>
                  </div>
                )) : (
                  <p className="rounded-lg border border-dashed border-stone-200 p-5 text-center text-sm text-stone-500">No other income recorded.</p>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm md:col-span-2 xl:col-span-1">
              <h2 className="text-xl font-black">Close shift</h2>
              <p className="mt-1 text-sm text-stone-500">
                Count the physical cash after all paid-outs are recorded.
              </p>
              {currentShift.canManage ? (
                <div className="mt-4">
                  <CloseShiftForm
                    activeOrderCount={currentShift.activeOrderCount}
                    expectedCard={currentShift.summary.card_on_delivery_total}
                    expectedCash={currentShift.summary.expected_cash_amount}
                    expectedUpi={currentShift.summary.upi_total}
                    marketplaceChannels={configuredMarketplaceChannels(
                      session.restaurant.shift_marketplace_channels
                    )}
                    restaurant={session.restaurant}
                    shiftId={currentShift.shift.id}
                  />
                </div>
              ) : (
                <p className="mt-4 rounded-lg bg-stone-100 p-4 text-sm font-bold text-stone-600">
                  This shift can be closed by its opener, a manager or the
                  restaurant owner.
                </p>
              )}
            </section>
          </div>
        </>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-black">Previous shifts</h2>
        <p className="mt-1 text-sm text-stone-500">
          {session.role === "staff"
            ? "Your closed shifts"
            : "The latest 50 closed shifts for this restaurant"}
        </p>
        <div className="mt-4 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
          {previousShifts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-4 py-3">Shift</th>
                    <th className="px-4 py-3">Completed sales</th>
                    <th className="px-4 py-3">Expected</th>
                    <th className="px-4 py-3">Counted</th>
                    <th className="px-4 py-3">Difference</th>
                    <th className="px-4 py-3">Report</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {previousShifts.map((shift) => (
                    <tr key={shift.id}>
                      <td className="px-4 py-3">
                        <p className="font-black">{shift.shift_name}</p>
                        <p className="whitespace-nowrap text-xs text-stone-500">
                          {formatDateTime(shift.opened_at)}
                          {shift.closed_at
                            ? ` → ${formatDateTime(shift.closed_at)}`
                            : ""}
                        </p>
                        {shift.closed_at ? (
                          <p className="whitespace-nowrap text-xs font-semibold text-stone-400">
                            {formatShiftDuration(shift.opened_at, shift.closed_at)} shift
                          </p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-bold">
                        {money(Number(shift.completed_sales))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {money(Number(shift.expected_cash_amount ?? 0))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {money(Number(shift.cash_counted_amount ?? 0))}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 font-black ${
                          Number(shift.difference_amount ?? 0) === 0
                            ? "text-emerald-700"
                            : "text-amber-700"
                        }`}
                      >
                        {money(Number(shift.difference_amount ?? 0))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {shift.close_report_version > 0 ? (
                          <Link
                            className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-xs font-black text-leaf"
                            href={`/admin/shifts/${shift.id}/report`}
                          >
                            View v{shift.close_report_version}
                          </Link>
                        ) : (
                          <span className="text-xs font-semibold text-stone-400">
                            Legacy shift
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-8 text-center text-sm text-stone-500">
              No closed shifts yet.
            </p>
          )}
        </div>
      </section>

      {session.role !== "staff" ? (
        <section className="mt-8">
          <h2 className="text-xl font-black">Closed business days</h2>
          <p className="mt-1 text-sm text-stone-500">Combined reports across all shifts in each operating day.</p>
          <div className="mt-4 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
            {previousBusinessDays.length ? (
              <div className="divide-y divide-stone-100">
                {previousBusinessDays.map((day) => (
                  <div className="flex items-center justify-between gap-4 p-4" key={day.id}>
                    <div>
                      <p className="font-black">Business day {day.business_date}</p>
                      <p className="text-xs text-stone-500">Closed {day.closed_at ? formatDateTime(day.closed_at) : ""}</p>
                    </div>
                    <Link className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm font-black" href={`/admin/business-days/${day.id}/report`}>
                      View combined report
                    </Link>
                  </div>
                ))}
              </div>
            ) : <p className="p-5 text-sm text-stone-500">No business day has been closed yet.</p>}
          </div>
        </section>
      ) : null}
    </main>
  );
}
