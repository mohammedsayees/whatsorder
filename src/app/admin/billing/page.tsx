import Link from "next/link";
import { CreditCard, FileText, MessageCircle } from "lucide-react";
import { InvoicePaymentInstructions } from "@/components/admin/InvoicePaymentInstructions";
import { InvoiceStatusBadge } from "@/components/super-admin/BillingBadges";
import {
  billingDateString,
  priceForBillingInterval,
  priceForSubscription,
  type SubscriptionStatus
} from "@/lib/billing";
import {
  getBankTransferDetails,
  getOwnerSubscription,
  listOwnerInvoices
} from "@/lib/billing-data";
import { FOUNDER_WHATSAPP_NUMBER } from "@/lib/demo-store";
import {
  BILLING_ROLES,
  SUBSCRIPTION_STATUS_LABELS,
  amountDue,
  buildTrialConversionPreview,
  firstInvoiceSentence,
  formatBillingAmount,
  formatBillingDate,
  intervalLabel,
  intervalUnit,
  isInvoiceOverdue,
  isInvoiceUnpaid,
  sortInvoicesNewestFirst,
  trialEndHeadline
} from "@/lib/owner-billing";
import { requireRestaurantRole } from "@/lib/super-admin-auth";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const statusTone: Record<SubscriptionStatus, string> = {
  trialing: "bg-sky-100 text-sky-700",
  active: "bg-emerald-100 text-emerald-700",
  past_due: "bg-amber-100 text-amber-700",
  suspended: "bg-red-100 text-red-700",
  cancelled: "bg-stone-200 text-stone-600"
};

// Owner billing overview. Reachable in every subscription state, including
// suspended: it is how a paused restaurant finds out what to pay. Read-only.
export default async function AdminBillingPage() {
  // requireRestaurantRole wraps requireRestaurantAdmin and also keeps staff out.
  const session = await requireRestaurantRole([...BILLING_ROLES]);
  const restaurantId = session.restaurantId;
  const [{ subscription, plan }, invoices] = await Promise.all([
    getOwnerSubscription(restaurantId),
    listOwnerInvoices(restaurantId)
  ]);
  const bank = getBankTransferDetails();
  const today = billingDateString();
  const sortedInvoices = sortInvoicesNewestFirst(invoices);
  const unpaidInvoices = sortedInvoices.filter(isInvoiceUnpaid);
  const supportUrl = buildWhatsAppUrl(
    FOUNDER_WHATSAPP_NUMBER,
    `Hi WhatsOrder, I have a billing question for ${session.restaurant.name}.`
  );

  const chargedPrice =
    subscription && plan ? priceForSubscription(plan, subscription, today) : null;
  const listPrice =
    subscription && plan ? priceForBillingInterval(plan, subscription.billing_interval) : null;
  const discounted =
    chargedPrice !== null && listPrice !== null && Math.abs(chargedPrice - listPrice) >= 0.005;
  const preview =
    subscription && plan ? buildTrialConversionPreview({ subscription, plan, today }) : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-leaf">
          {session.restaurant.name}
        </p>
        <h1 className="text-3xl font-black">Billing</h1>
        <p className="mt-1 text-sm text-stone-500">
          Your WhatsOrder plan and invoices. Your customer ordering page is never affected by
          billing.
        </p>
      </div>

      <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <CreditCard className="text-leaf" size={18} />
          <h2 className="text-lg font-black">Your plan</h2>
        </div>

        {!subscription ? (
          <div className="mt-3 text-sm text-stone-600">
            <p className="font-bold text-stone-800">
              Your restaurant is not on a billing plan yet.
            </p>
            <p className="mt-1">
              You have full access and there is nothing to pay. WhatsOrder will be in touch
              before any plan starts.
            </p>
          </div>
        ) : (
          <>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-stone-500">Plan</dt>
                <dd className="mt-1 font-black">{plan?.name ?? "Unknown plan"}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Billing</dt>
                <dd className="mt-1 font-black">{intervalLabel(subscription.billing_interval)}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Price</dt>
                <dd className="mt-1 font-black">
                  {chargedPrice !== null && plan
                    ? `${formatBillingAmount(chargedPrice, plan.currency)} / ${intervalUnit(
                        subscription.billing_interval
                      )}`
                    : "—"}
                </dd>
                {discounted && plan && listPrice !== null ? (
                  <dd className="mt-1 text-xs text-stone-500">
                    Your contract price (list price{" "}
                    {formatBillingAmount(listPrice, plan.currency)})
                    {subscription.price_override_ends_at
                      ? ` until ${formatBillingDate(subscription.price_override_ends_at)}`
                      : ""}
                  </dd>
                ) : null}
              </div>
              <div>
                <dt className="text-stone-500">Status</dt>
                <dd className="mt-1">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-black ${statusTone[subscription.status]}`}
                  >
                    {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                  </span>
                </dd>
              </div>
            </dl>

            <div className="mt-4 rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-700">
              {subscription.status === "trialing" && preview ? (
                <>
                  <p className="font-bold text-stone-900">{trialEndHeadline(preview)}.</p>
                  <p className="mt-1">{firstInvoiceSentence(preview)}</p>
                </>
              ) : subscription.status === "trialing" ? (
                <p className="font-bold text-stone-900">You are on a free trial.</p>
              ) : (
                <p>
                  Current billing period:{" "}
                  <span className="font-bold">
                    {formatBillingDate(subscription.billing_cycle_start)} –{" "}
                    {formatBillingDate(subscription.billing_cycle_end)}
                  </span>
                  {subscription.cancel_at_period_end && subscription.status !== "cancelled"
                    ? ". Your plan ends at the end of this period."
                    : ""}
                </p>
              )}
              {subscription.status === "past_due" ? (
                <p className="mt-1 font-bold text-amber-800">
                  An invoice is overdue.
                  {subscription.grace_until
                    ? ` Please pay by ${formatBillingDate(subscription.grace_until)} to avoid management features being paused.`
                    : " Please pay it to avoid management features being paused."}
                </p>
              ) : null}
              {subscription.status === "suspended" ? (
                <p className="mt-1 font-bold text-red-700">
                  Management features are paused until the outstanding invoice is paid. Your
                  customer ordering page stays live.
                </p>
              ) : null}
            </div>
          </>
        )}
      </section>

      {unpaidInvoices.length > 0 ? (
        <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black">To pay</h2>
          <div className="mt-4 space-y-4">
            {unpaidInvoices.map((invoice) => (
              <div key={invoice.id}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <Link
                    className="font-mono font-black text-leaf underline"
                    href={`/admin/billing/invoices/${invoice.id}`}
                  >
                    {invoice.invoice_number}
                  </Link>
                  <span className={isInvoiceOverdue(invoice) ? "font-bold text-red-700" : "text-stone-600"}>
                    {invoice.due_at
                      ? `${isInvoiceOverdue(invoice) ? "Overdue since" : "Due"} ${formatBillingDate(invoice.due_at)}`
                      : "Due on receipt"}
                  </span>
                </div>
                <InvoicePaymentInstructions
                  amountDue={amountDue(invoice)}
                  bank={bank}
                  currency={invoice.currency}
                  invoiceNumber={invoice.invoice_number}
                  restaurantName={session.restaurant.name}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-6 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <header className="flex items-center gap-2 border-b border-stone-200 px-5 py-4">
          <FileText className="text-leaf" size={18} />
          <h2 className="text-lg font-black">Invoices</h2>
        </header>
        {sortedInvoices.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-stone-500">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-5 py-3 font-black">Number</th>
                  <th className="px-5 py-3 font-black">Period</th>
                  <th className="px-5 py-3 font-black">Total</th>
                  <th className="px-5 py-3 font-black">Due</th>
                  <th className="px-5 py-3 font-black">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {sortedInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-stone-50">
                    <td className="px-5 py-3 font-mono text-xs font-bold">{invoice.invoice_number}</td>
                    <td className="px-5 py-3 text-stone-600">
                      {formatBillingDate(invoice.period_start)} –{" "}
                      {formatBillingDate(invoice.period_end)}
                    </td>
                    <td className="px-5 py-3 font-bold">
                      {formatBillingAmount(Number(invoice.total), invoice.currency)}
                    </td>
                    <td className="px-5 py-3 text-stone-600">
                      {invoice.due_at ? formatBillingDate(invoice.due_at) : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <InvoiceStatusBadge status={invoice.status} />
                      {isInvoiceOverdue(invoice) ? (
                        <span className="ml-2 text-xs font-bold text-red-700">Overdue</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        className="focus-ring rounded-lg px-2 py-1 text-xs font-black text-leaf hover:bg-mint"
                        href={`/admin/billing/invoices/${invoice.id}`}
                      >
                        View / print
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-6 text-sm text-stone-500">
        Questions about your plan or an invoice?{" "}
        <a
          className="inline-flex items-center gap-1 font-bold text-leaf underline"
          href={supportUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          <MessageCircle size={14} /> Message WhatsOrder support
        </a>
      </p>
    </main>
  );
}
