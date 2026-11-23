import Link from "next/link";
import {
  ONLINE_PAYMENT_FILTERS,
  type OnlinePaymentFilter,
  type OnlinePaymentsReport
} from "@/lib/online-payments-report";
import type { OnlinePaymentStatus } from "@/lib/stripe/order-payment-rules";

// Reports → "Online payments": Stripe "Pay online" orders for the period,
// from WhatsOrder's own order records. Server-rendered; no client JS.

const statusStyles: Record<OnlinePaymentStatus, string> = {
  paid: "bg-emerald-50 text-emerald-800",
  pending: "bg-amber-50 text-amber-800",
  expired: "bg-stone-100 text-stone-600",
  failed: "bg-rose-50 text-rose-700",
  refunded: "bg-sky-50 text-sky-800"
};

export function OnlinePaymentsSummary({
  report,
  money
}: {
  report: OnlinePaymentsReport;
  money: (value: number) => string;
}) {
  const cards: Array<{ label: string; count: number; amount: number; tone: string }> = [
    { label: "Paid online", count: report.paid.count, amount: report.paid.amount, tone: "text-emerald-700" },
    { label: "Awaiting payment", count: report.pending.count, amount: report.pending.amount, tone: "text-amber-700" },
    { label: "Not completed", count: report.notCompleted.count, amount: report.notCompleted.amount, tone: "text-stone-700" },
    { label: "Refunded", count: report.refunded.count, amount: report.refunded.amount, tone: "text-sky-700" }
  ];

  return (
    <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm" key={card.label}>
          <p className="text-sm font-bold text-stone-500">{card.label}</p>
          <p className={`mt-2 text-2xl font-black ${card.tone}`}>{money(card.amount)}</p>
          <p className="mt-1 text-xs font-bold text-stone-500">
            {card.count} {card.count === 1 ? "order" : "orders"}
          </p>
        </div>
      ))}
    </section>
  );
}

export function OnlinePaymentsTable({
  report,
  filter,
  filterHref,
  money,
  formatDateTime
}: {
  report: OnlinePaymentsReport;
  filter: OnlinePaymentFilter;
  filterHref: (filter: OnlinePaymentFilter) => string;
  money: (value: number) => string;
  formatDateTime: (value: string) => string;
}) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-black">Online payments</h2>
        <p className="text-sm text-stone-500">
          Orders where the customer chose Pay online, by the time the order was placed. Amounts are what the customer
          was charged; Stripe fees and bank payouts are in your Stripe account.
        </p>
      </div>

      <nav aria-label="Online payment status" className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {ONLINE_PAYMENT_FILTERS.map((option) => (
          <Link
            aria-current={filter === option.value ? "page" : undefined}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-black ${
              filter === option.value ? "bg-ink text-white" : "bg-stone-100 text-stone-600"
            }`}
            href={filterHref(option.value)}
            key={option.value}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      {report.entries.length ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-stone-200">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-3 py-2">Placed</th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Online payment</th>
                <th className="px-3 py-2">Paid at</th>
                <th className="px-3 py-2">Order status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {report.entries.map((entry) => (
                <tr key={entry.orderId}>
                  <td className="whitespace-nowrap px-3 py-2">{formatDateTime(entry.placedAt)}</td>
                  <td className="px-3 py-2">
                    <Link className="font-black text-leaf underline-offset-2 hover:underline" href={`/admin/orders/${entry.orderId}`}>
                      {entry.reference}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-bold">{entry.customerName}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-black">{money(entry.amount)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-black ${statusStyles[entry.paymentStatus]}`}>
                      {entry.paymentLabel}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-stone-600">
                    {entry.paidAt ? formatDateTime(entry.paidAt) : "—"}
                  </td>
                  <td className="px-3 py-2 text-stone-600">{entry.orderStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-stone-200 p-8 text-center text-sm text-stone-500">
          {filter === "all"
            ? "No customer chose Pay online in this period."
            : "No online payments with this status in this period."}
        </p>
      )}
    </section>
  );
}
