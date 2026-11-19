"use client";

import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { approveFinanceDocumentAction } from "@/app/admin/finance/documents/actions";
import type { FinanceCategory } from "@/lib/finance";
import type { FinanceDocument } from "@/lib/finance-document";
import type { OpenShiftTill, PaidOutReceiptContext } from "@/lib/finance-paid-out-data";
import { formatFils } from "@/lib/finance";
import { FinanceTillPaymentFields } from "@/components/admin/FinanceTillPaymentFields";

type ReviewLine = {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  amount: string;
  tax: string;
  classification: string;
};

function filsInput(value: number | null | undefined) {
  return value === null || value === undefined ? "" : (Number(value) / 100).toFixed(2);
}

export function FinanceBillReviewForm({
  categories,
  document,
  possibleDuplicate,
  till = null,
  tillOpenedAtLabel = "",
  receiptPaidOut = null,
  receiptRecordedAtLabel = "",
  recurringCosts = []
}: {
  categories: FinanceCategory[];
  document: FinanceDocument;
  possibleDuplicate: boolean;
  till?: OpenShiftTill | null;
  tillOpenedAtLabel?: string;
  receiptPaidOut?: PaidOutReceiptContext | null;
  receiptRecordedAtLabel?: string;
  recurringCosts?: { id: string; description: string }[];
}) {
  const extracted = document.extracted_json!;
  const [lines, setLines] = useState<ReviewLine[]>(
    (extracted.lines ?? []).map((line, index) => ({
      id: `extracted-${index}`,
      description: line.description,
      quantity: line.quantity ?? "",
      unit: line.unit ?? "",
      unitPrice: filsInput(line.unit_price_fils),
      amount: filsInput(line.amount_fils),
      tax: filsInput(line.tax_fils),
      classification: line.classification
    }))
  );
  const nextLineId = useRef(lines.length);

  function updateLine(index: number, patch: Partial<ReviewLine>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  return (
    <form action={approveFinanceDocumentAction} className="space-y-5">
      <input name="document_id" type="hidden" value={document.id} />
      <input
        name="lines_json"
        type="hidden"
        value={JSON.stringify(lines.map(({ id: _id, ...line }) => line))}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">Supplier<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" defaultValue={extracted.supplier_name ?? ""} maxLength={160} name="supplier_name" /></label>
        <label className="text-sm font-bold">Invoice number<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" defaultValue={extracted.invoice_number ?? ""} maxLength={100} name="invoice_number" /></label>
        <label className="text-sm font-bold">Invoice date<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" defaultValue={extracted.invoice_date ?? ""} name="incurred_on" required type="date" /></label>
        <label className="text-sm font-bold">Category<select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="category_id" required><option value="">Choose category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="text-sm font-bold sm:col-span-2">Expense description<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" defaultValue={extracted.supplier_name ? `Bill from ${extracted.supplier_name}` : "Reviewed bill"} maxLength={240} name="description" required /></label>
        <label className="text-sm font-bold">Subtotal (AED)<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" defaultValue={filsInput(extracted.subtotal_fils)} inputMode="decimal" name="subtotal" required /></label>
        <label className="text-sm font-bold">Input VAT (AED)<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" defaultValue={filsInput(extracted.vat_fils)} inputMode="decimal" name="vat" required /></label>
        <label className="text-sm font-bold">Total (AED)<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" defaultValue={filsInput(extracted.total_fils)} inputMode="decimal" name="total" required /></label>
        <label className="flex items-center gap-2 self-end pb-3 text-sm font-bold"><input defaultChecked={extracted.vat_inclusive} name="vat_inclusive" type="checkbox" /> Printed total includes VAT</label>
        <label className="text-sm font-bold">Payment status<select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="payment_status"><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="partial">Partially paid</option></select></label>
        <label className="text-sm font-bold">Payment method<select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="payment_method"><option value="">Not recorded</option><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label>
        <label className="text-sm font-bold">Paid on<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="paid_on" type="date" /></label>
        <label className="text-sm font-bold">Amount paid so far (AED, for partial payments)<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" inputMode="decimal" name="paid_amount" placeholder="0.00" /></label>
        <label className="text-sm font-bold">Service period start<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="service_period_start" type="date" /><span className="mt-1 block text-xs font-normal text-stone-500">For bills covering a period, e.g. a monthly utility bill</span></label>
        <label className="text-sm font-bold">Service period end<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="service_period_end" type="date" /></label>
        {recurringCosts.length > 0 ? <label className="text-sm font-bold sm:col-span-2">Recurring schedule (optional)<select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" defaultValue="" name="recurring_cost_id"><option value="">Not linked</option>{recurringCosts.map((cost) => <option key={cost.id} value={cost.id}>{cost.description}</option>)}</select><span className="mt-1 block text-xs font-normal text-stone-500">Link a bill that pays a scheduled cost (e.g. rent) so it isn&apos;t counted twice.</span></label> : null}
        {till ? <FinanceTillPaymentFields openedAtLabel={tillOpenedAtLabel} till={till} /> : null}
        {receiptPaidOut ? (
          <fieldset className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm sm:col-span-2">
            <p className="font-bold text-sky-950">Attached at the till to a cash paid-out</p>
            <p className="mt-1 text-xs text-sky-900">
              {formatFils(receiptPaidOut.amountFils)} · {receiptPaidOut.reason} · {receiptRecordedAtLabel}. Posting records this bill as paid in cash and links it to that paid-out; payment fields on this form are ignored.
            </p>
            {receiptPaidOut.voided ? (
              <p className="mt-2 text-xs font-bold text-red-700">That paid-out was voided, so this receipt can&apos;t be posted against it. Delete the receipt or upload the bill again from Finance.</p>
            ) : (
              <div className="mt-2 grid gap-2">
                <label className="flex items-start gap-2 text-xs font-bold">
                  <input className="mt-0.5 h-4 w-4" name="confirm_mismatch" type="checkbox" />
                  If the bill total differs from the {formatFils(receiptPaidOut.amountFils)} paid out, I confirm this is the right bill
                </label>
                <label className="text-xs font-bold">Reason for the difference (required if the amounts differ)
                  <input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-normal" maxLength={300} name="mismatch_reason" placeholder="e.g. part paid by card" />
                </label>
              </div>
            )}
          </fieldset>
        ) : null}
      </div>

      <section className="border-t border-stone-100 pt-5">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-black">Line items</h2><p className="text-xs text-stone-500">Optional detail; correct uncertain descriptions and amounts.</p></div><button className="focus-ring inline-flex items-center gap-1 rounded-lg border border-stone-300 px-3 py-2 text-xs font-black" onClick={() => { const id = `added-${nextLineId.current++}`; setLines((current) => [...current, { id, description: "", quantity: "", unit: "", unitPrice: "", amount: "0.00", tax: "0.00", classification: "expense" }]); }} type="button"><Plus size={14} /> Add line</button></div>
        <div className="mt-3 space-y-3">{lines.map((line, index) => <article className="rounded-lg border border-stone-200 p-3" key={line.id}><div className="grid gap-3 sm:grid-cols-6"><label className="text-xs font-bold sm:col-span-3">Description<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-2 py-2" onChange={(event) => updateLine(index, { description: event.target.value })} value={line.description} /></label><label className="text-xs font-bold">Qty<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-2 py-2" inputMode="decimal" onChange={(event) => updateLine(index, { quantity: event.target.value })} value={line.quantity} /></label><label className="text-xs font-bold">Unit<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-2 py-2" onChange={(event) => updateLine(index, { unit: event.target.value })} value={line.unit} /></label><button aria-label={`Remove line ${index + 1}`} className="focus-ring self-end justify-self-end rounded-lg p-2 text-red-700" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} type="button"><Trash2 size={16} /></button><label className="text-xs font-bold">Unit price<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-2 py-2" inputMode="decimal" onChange={(event) => updateLine(index, { unitPrice: event.target.value })} value={line.unitPrice} /></label><label className="text-xs font-bold">Amount<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-2 py-2" inputMode="decimal" onChange={(event) => updateLine(index, { amount: event.target.value })} value={line.amount} /></label><label className="text-xs font-bold">Tax<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-2 py-2" inputMode="decimal" onChange={(event) => updateLine(index, { tax: event.target.value })} value={line.tax} /></label><label className="text-xs font-bold sm:col-span-3">Classification<select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-2 py-2" onChange={(event) => updateLine(index, { classification: event.target.value })} value={line.classification}><option value="expense">Expense</option><option value="purchase">Purchase</option><option value="fee">Fee</option><option value="discount">Discount</option><option value="other">Other</option></select></label></div></article>)}</div>
      </section>

      {possibleDuplicate ? <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900"><input className="mt-1" name="confirm_possible_duplicate" type="checkbox" /> I reviewed the similar expense warning and confirm this is a different bill.</label> : null}
      <button className="focus-ring w-full rounded-lg bg-leaf px-4 py-3 text-sm font-black text-white" type="submit">Approve and post expense</button>
      <p className="text-center text-xs text-stone-500">AI data has no effect until this button succeeds. Approval is idempotent.</p>
    </form>
  );
}
