import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { InvoicePaymentInstructions } from "@/components/admin/InvoicePaymentInstructions";
import { PrintPageButton } from "@/components/admin/PrintPageButton";
import { InvoiceStatusBadge } from "@/components/super-admin/BillingBadges";
import { getBankTransferDetails, getOwnerInvoice } from "@/lib/billing-data";
import {
  BILLING_ROLES,
  INVOICE_ISSUER_NAME,
  amountDue,
  formatBillingAmount,
  formatBillingDate,
  isInvoiceOverdue,
  isInvoiceUnpaid,
  isUuid
} from "@/lib/owner-billing";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

export const dynamic = "force-dynamic";

// Printable single invoice. The invoice id comes from the URL, so it is only
// ever looked up together with the session's restaurant id: another tenant's
// invoice id simply 404s.
export default async function AdminInvoicePage({
  params
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const [session, { invoiceId }] = await Promise.all([
    requireRestaurantRole([...BILLING_ROLES]),
    params
  ]);
  if (!isUuid(invoiceId)) {
    notFound();
  }
  const invoice = await getOwnerInvoice(session.restaurantId, invoiceId);
  if (!invoice) {
    notFound();
  }
  const bank = getBankTransferDetails();
  const money = (value: number) => formatBillingAmount(Number(value), invoice.currency);
  const due = amountDue(invoice);
  const overdue = isInvoiceOverdue(invoice);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 print:max-w-none print:px-0 print:py-0">
      <div className="flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <Link
          className="focus-ring inline-flex items-center gap-2 text-sm font-black text-leaf"
          href="/admin/billing"
        >
          <ArrowLeft size={16} /> Back to billing
        </Link>
        <PrintPageButton />
      </div>

      <article className="mt-5 rounded-lg border border-stone-200 bg-white p-6 shadow-sm print:mt-0 print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-5">
          <div>
            <p className="text-2xl font-black">{INVOICE_ISSUER_NAME}</p>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-black uppercase tracking-wide">
              {invoice.status === "paid" ? "Invoice (paid)" : "Invoice"}
            </h1>
            <p className="mt-1 font-mono text-sm font-bold">{invoice.invoice_number}</p>
            <div className="mt-2">
              <InvoiceStatusBadge status={invoice.status} />
              {overdue ? (
                <span className="ml-2 text-xs font-bold text-red-700">Overdue</span>
              ) : null}
            </div>
          </div>
        </header>

        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-black uppercase text-stone-500">Billed to</dt>
            <dd className="mt-1 font-bold">{session.restaurant.name}</dd>
          </div>
          <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 sm:justify-self-end">
            <dt className="text-stone-500">Issued</dt>
            <dd className="font-bold">
              {invoice.issued_at ? formatBillingDate(invoice.issued_at) : "—"}
            </dd>
            <dt className="text-stone-500">Due</dt>
            <dd className="font-bold">{invoice.due_at ? formatBillingDate(invoice.due_at) : "—"}</dd>
            <dt className="text-stone-500">Period</dt>
            <dd className="font-bold">
              {formatBillingDate(invoice.period_start)} – {formatBillingDate(invoice.period_end)}
            </dd>
            {invoice.paid_at ? (
              <>
                <dt className="text-stone-500">Paid</dt>
                <dd className="font-bold">{formatBillingDate(invoice.paid_at)}</dd>
              </>
            ) : null}
          </div>
        </dl>

        <table className="mt-6 w-full text-left text-sm">
          <thead className="border-b border-stone-200 text-xs uppercase text-stone-500">
            <tr>
              <th className="py-2 font-black">Description</th>
              <th className="py-2 text-right font-black">Qty</th>
              <th className="py-2 text-right font-black">Unit price</th>
              <th className="py-2 text-right font-black">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {invoice.line_items.length === 0 ? (
              <tr>
                <td className="py-3 text-stone-500" colSpan={4}>
                  No line items.
                </td>
              </tr>
            ) : (
              invoice.line_items.map((item) => (
                <tr key={item.id}>
                  <td className="py-3 pr-4">{item.description}</td>
                  <td className="py-3 text-right">{Number(item.quantity)}</td>
                  <td className="py-3 text-right">{money(item.unit_amount)}</td>
                  <td className="py-3 text-right font-bold">{money(item.line_total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <dl className="ml-auto mt-4 grid max-w-xs grid-cols-2 gap-y-1 border-t border-stone-200 pt-3 text-sm">
          <dt className="text-stone-500">Subtotal</dt>
          <dd className="text-right font-bold">{money(invoice.subtotal)}</dd>
          <dt className="text-stone-500">VAT ({Number(invoice.vat_rate)}%)</dt>
          <dd className="text-right font-bold">{money(invoice.vat_amount)}</dd>
          <dt className="font-black">Total</dt>
          <dd className="text-right font-black">{money(invoice.total)}</dd>
          {Number(invoice.paid_to_date) > 0 ? (
            <>
              <dt className="text-stone-500">Paid</dt>
              <dd className="text-right font-bold">{money(invoice.paid_to_date)}</dd>
            </>
          ) : null}
          {invoice.status === "issued" ? (
            <>
              <dt className="font-black">Amount due</dt>
              <dd className="text-right font-black">{money(due)}</dd>
            </>
          ) : null}
        </dl>

        {invoice.status === "void" ? (
          <p className="mt-6 rounded-lg bg-stone-100 px-4 py-3 text-sm font-bold text-stone-600">
            This invoice has been voided. Nothing is owed on it.
          </p>
        ) : null}

        {isInvoiceUnpaid(invoice) ? (
          <div className="mt-6">
            <InvoicePaymentInstructions
              amountDue={due}
              bank={bank}
              currency={invoice.currency}
              invoiceNumber={invoice.invoice_number}
              restaurantName={session.restaurant.name}
            />
          </div>
        ) : null}
      </article>
    </main>
  );
}
