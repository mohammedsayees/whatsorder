import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";
import {
  InvoiceStatusBadge,
  SubscriptionStatusBadge
} from "@/components/super-admin/BillingBadges";
import { formatAED } from "@/lib/currency";
import { formatUaeDate, formatUaeShortDateTime } from "@/lib/date-time";
import { PAYMENT_METHODS } from "@/lib/billing";
import { getBillingDetail, listActivePlans } from "@/lib/billing-data";
import {
  assignPlanAction,
  changeStatusAction,
  issueInvoiceAction,
  recordPaymentAction,
  voidInvoiceAction
} from "../actions";

const STATUS_OPTIONS = [
  { value: "trialing", label: "Trialing" },
  { value: "active", label: "Active" },
  { value: "past_due", label: "Past due" },
  { value: "suspended", label: "Suspended" },
  { value: "cancelled", label: "Cancelled" }
];

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other"
};

export default async function BillingDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const [{ restaurantId }, query, plans] = await Promise.all([
    params,
    searchParams,
    listActivePlans()
  ]);
  const detail = await getBillingDetail(restaurantId);
  if (!detail) {
    notFound();
  }

  const { restaurant, subscription, plan, invoices, payments, statusEvents } = detail;
  const openInvoices = invoices.filter((invoice) => invoice.status === "issued");

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8">
      <Link
        className="focus-ring inline-flex items-center gap-1 text-sm font-bold text-stone-500 hover:text-leaf"
        href="/super-admin/billing"
      >
        <ArrowLeft size={16} /> Back to billing
      </Link>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-black">{restaurant.name}</h1>
          <p className="mt-1 text-stone-600">Billing &amp; subscription</p>
        </div>
        {subscription ? <SubscriptionStatusBadge status={subscription.status} /> : null}
      </div>

      {query.error ? (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          <AlertTriangle size={16} /> {decodeURIComponent(query.error)}
        </p>
      ) : null}
      {query.saved ? (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          <CheckCircle2 size={16} /> Saved.
        </p>
      ) : null}

      {!subscription ? (
        <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black">Enrol on a plan</h2>
          <p className="mt-1 text-sm text-stone-600">
            This restaurant has no subscription yet.
          </p>
          <form action={assignPlanAction} className="mt-4 grid gap-3 sm:grid-cols-3">
            <input name="restaurant_id" type="hidden" value={restaurant.id} />
            <label className="text-sm font-bold text-stone-700">
              Plan
              <select
                className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
                name="plan_id"
                required
              >
                {plans.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} — {formatAED(Number(entry.monthly_price))}/mo
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 self-end text-sm font-bold text-stone-700">
              <input className="h-4 w-4" name="start_trial" type="checkbox" />
              Start as 30-day trial
            </label>
            <button
              className="focus-ring self-end rounded-lg bg-leaf px-4 py-2.5 text-sm font-black text-white"
              type="submit"
            >
              Enrol
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-black">Subscription</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-stone-500">Plan</dt>
                  <dd className="font-bold">{plan?.name ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-stone-500">Monthly</dt>
                  <dd className="font-bold">{formatAED(Number(plan?.monthly_price ?? 0))}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-stone-500">Current cycle</dt>
                  <dd className="font-bold">
                    {formatUaeDate(subscription.billing_cycle_start)} –{" "}
                    {formatUaeDate(subscription.billing_cycle_end)}
                  </dd>
                </div>
                {subscription.trial_ends_at ? (
                  <div className="flex justify-between">
                    <dt className="text-stone-500">Trial ends</dt>
                    <dd className="font-bold">{formatUaeDate(subscription.trial_ends_at)}</dd>
                  </div>
                ) : null}
                {subscription.grace_until ? (
                  <div className="flex justify-between">
                    <dt className="text-stone-500">Grace until</dt>
                    <dd className="font-bold text-amber-700">
                      {formatUaeDate(subscription.grace_until)}
                    </dd>
                  </div>
                ) : null}
              </dl>

              <form action={assignPlanAction} className="mt-4 border-t border-stone-100 pt-4">
                <input name="restaurant_id" type="hidden" value={restaurant.id} />
                <p className="text-sm font-bold text-stone-700">Change plan</p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <select
                    className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                    defaultValue={plan?.id}
                    name="plan_id"
                  >
                    {plans.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name} — {formatAED(Number(entry.monthly_price))}/mo
                      </option>
                    ))}
                  </select>
                  <button
                    className="focus-ring shrink-0 rounded-lg bg-ink px-4 py-2 text-sm font-black text-white"
                    type="submit"
                  >
                    Apply
                  </button>
                </div>
              </form>
            </article>

            <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-black">Change status</h2>
              <p className="mt-1 text-sm text-stone-600">
                Concierge override. Recording a payment heals past-due / suspended automatically —
                use this only for manual corrections.
              </p>
              <form action={changeStatusAction} className="mt-3 space-y-3">
                <input name="restaurant_id" type="hidden" value={restaurant.id} />
                <select
                  className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                  defaultValue={subscription.status}
                  name="status"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  className="focus-ring w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                  name="reason"
                  placeholder="Reason (recorded in the audit trail)"
                />
                <button
                  className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm font-black text-white"
                  type="submit"
                >
                  Update status
                </button>
              </form>
            </article>
          </section>

          <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">Issue an invoice</h2>
            <p className="mt-1 text-sm text-stone-600">
              Issues an invoice for the current cycle ({formatUaeDate(subscription.billing_cycle_start)}{" "}
              – {formatUaeDate(subscription.billing_cycle_end)}). Leave the amount blank to use the
              plan price, or set a negotiated amount (e.g. multi-branch). Re-issuing the same period
              is a no-op.
            </p>
            <form action={issueInvoiceAction} className="mt-3 grid gap-3 sm:grid-cols-3">
              <input name="restaurant_id" type="hidden" value={restaurant.id} />
              <label className="text-sm font-bold text-stone-700">
                Amount (AED)
                <input
                  className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
                  inputMode="decimal"
                  name="unit_amount"
                  placeholder={String(plan?.monthly_price ?? "")}
                  type="text"
                />
              </label>
              <label className="text-sm font-bold text-stone-700 sm:col-span-1">
                Description (optional)
                <input
                  className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
                  name="description"
                  placeholder="e.g. Multi-branch — 3 branches"
                  type="text"
                />
              </label>
              <button
                className="focus-ring self-end rounded-lg bg-leaf px-4 py-2.5 text-sm font-black text-white"
                type="submit"
              >
                Issue invoice
              </button>
            </form>
          </section>

          <section className="mt-6 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
            <header className="border-b border-stone-200 px-5 py-4">
              <h2 className="text-lg font-black">Invoices</h2>
            </header>
            {invoices.length === 0 ? (
              <p className="px-5 py-8 text-center text-stone-500">No invoices yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                    <tr>
                      <th className="px-5 py-3 font-black">Number</th>
                      <th className="px-5 py-3 font-black">Period</th>
                      <th className="px-5 py-3 font-black">Total</th>
                      <th className="px-5 py-3 font-black">Paid</th>
                      <th className="px-5 py-3 font-black">Due</th>
                      <th className="px-5 py-3 font-black">Status</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {invoices.map((invoice) => (
                      <tr key={invoice.id} className="hover:bg-stone-50">
                        <td className="px-5 py-3 font-mono text-xs font-bold">
                          {invoice.invoice_number}
                        </td>
                        <td className="px-5 py-3 text-stone-600">
                          {formatUaeDate(invoice.period_start)} – {formatUaeDate(invoice.period_end)}
                        </td>
                        <td className="px-5 py-3 font-bold">{formatAED(Number(invoice.total))}</td>
                        <td className="px-5 py-3 text-stone-600">
                          {formatAED(Number(invoice.paid_to_date))}
                        </td>
                        <td className="px-5 py-3 text-stone-600">
                          {invoice.due_at ? formatUaeDate(invoice.due_at) : "—"}
                        </td>
                        <td className="px-5 py-3">
                          <InvoiceStatusBadge status={invoice.status} />
                        </td>
                        <td className="px-5 py-3 text-right">
                          {invoice.status === "issued" ? (
                            <form action={voidInvoiceAction}>
                              <input name="restaurant_id" type="hidden" value={restaurant.id} />
                              <input name="invoice_id" type="hidden" value={invoice.id} />
                              <button
                                className="focus-ring rounded-lg px-2 py-1 text-xs font-black text-red-600 hover:bg-red-50"
                                type="submit"
                              >
                                Void
                              </button>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">Record a payment</h2>
            {openInvoices.length === 0 ? (
              <p className="mt-2 text-sm text-stone-500">No open invoices to settle.</p>
            ) : (
              <form action={recordPaymentAction} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <input name="restaurant_id" type="hidden" value={restaurant.id} />
                <label className="text-sm font-bold text-stone-700 lg:col-span-2">
                  Invoice
                  <select
                    className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
                    name="invoice_id"
                    required
                  >
                    {openInvoices.map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.invoice_number} — {formatAED(Number(invoice.total))} (
                        {formatAED(Number(invoice.paid_to_date))} paid)
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-bold text-stone-700">
                  Amount (AED)
                  <input
                    className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
                    inputMode="decimal"
                    name="amount"
                    required
                    type="text"
                  />
                </label>
                <label className="text-sm font-bold text-stone-700">
                  Method
                  <select
                    className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
                    name="method"
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-bold text-stone-700">
                  Reference
                  <input
                    className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
                    name="reference"
                    placeholder="Transfer ref"
                    type="text"
                  />
                </label>
                <button
                  className="focus-ring self-end rounded-lg bg-leaf px-4 py-2.5 text-sm font-black text-white lg:col-span-5 lg:w-fit"
                  type="submit"
                >
                  Record payment
                </button>
              </form>
            )}

            {payments.length > 0 ? (
              <div className="mt-5 border-t border-stone-100 pt-4">
                <p className="text-sm font-bold text-stone-700">Recorded payments</p>
                <ul className="mt-2 space-y-1 text-sm text-stone-600">
                  {payments.map((payment) => (
                    <li key={payment.id} className="flex justify-between">
                      <span>
                        {formatUaeDate(payment.received_at)} · {PAYMENT_METHOD_LABELS[payment.method]}
                        {payment.reference ? ` · ${payment.reference}` : ""}
                      </span>
                      <span className="font-bold">{formatAED(Number(payment.amount))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">Status history</h2>
            {statusEvents.length === 0 ? (
              <p className="mt-2 text-sm text-stone-500">No status changes recorded.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {statusEvents.map((event) => (
                  <li key={event.id} className="flex flex-wrap items-center gap-2 text-stone-600">
                    <span className="text-xs text-stone-400">
                      {formatUaeShortDateTime(event.created_at)}
                    </span>
                    <span className="font-bold">
                      {event.from_status ? `${event.from_status} → ` : ""}
                      {event.to_status}
                    </span>
                    {event.reason ? <span className="text-stone-500">· {event.reason}</span> : null}
                    {event.actor_role ? (
                      <span className="text-xs text-stone-400">({event.actor_role})</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
