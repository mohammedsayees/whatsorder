"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { createFinanceExpenseAction } from "@/app/admin/finance/actions";
import { approveFinanceDocumentAction } from "@/app/admin/finance/documents/actions";
import { formatFils } from "@/lib/finance";
import {
  SIMPLE_PAYMENT_LABELS,
  categoryIcon,
  categoryLabel,
  filsToInput,
  inputToFils,
  paymentFields,
  type SimplePaymentChoice
} from "@/lib/finance-simple";

export type SimpleBillLine = {
  description: string;
  quantity: string | null;
  unit: string | null;
  unit_price_fils: number | null;
  amount_fils: number;
  tax_fils: number;
  classification: string;
};

export type SimpleBillFormProps = {
  kind: "document" | "manual";
  documentId?: string;
  categories: { id: string; name: string }[];
  today: string;
  canApprove: boolean;
  defaults?: {
    supplier?: string | null;
    invoiceNumber?: string | null;
    invoiceDate?: string | null;
    totalFils?: number | null;
    vatFils?: number | null;
    lines?: SimpleBillLine[];
  };
  /** Open shift the bill can be paid from, or null when that isn't possible. */
  till?: { shiftId: string; label: string; unbilledAmountsFils: number[] } | null;
  /** The bill was attached at the till to this paid-out. */
  receiptPaidOut?: { amountFils: number; reason: string; voided: boolean } | null;
  possibleDuplicate?: boolean;
};

function SaveButton({ disabled, label }: { disabled: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="focus-ring w-full rounded-xl bg-leaf px-4 py-4 text-base font-black text-white disabled:opacity-50"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export function SimpleBillForm({
  kind,
  documentId,
  categories,
  today,
  canApprove,
  defaults = {},
  till = null,
  receiptPaidOut = null,
  possibleDuplicate = false
}: SimpleBillFormProps) {
  const [supplier, setSupplier] = useState(defaults.supplier ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [total, setTotal] = useState(filsToInput(defaults.totalFils));
  const [vat, setVat] = useState(filsToInput(defaults.vatFils ?? 0) || "0.00");
  const [includesVat, setIncludesVat] = useState(false);
  const [billDate, setBillDate] = useState(defaults.invoiceDate ?? today);
  const [payment, setPayment] = useState<SimplePaymentChoice | null>(receiptPaidOut ? "till" : null);

  const totalFils = inputToFils(total);
  const vatFils = kind === "document" ? inputToFils(vat || "0") : 0;
  const category = categories.find((item) => item.id === categoryId);
  const amountsValid = totalFils !== null && totalFils > 0 && vatFils !== null && vatFils <= totalFils;
  const mismatch = receiptPaidOut && totalFils !== null && totalFils !== receiptPaidOut.amountFils;
  const sameAmountAtTill = payment === "till" && totalFils !== null &&
    (till?.unbilledAmountsFils ?? []).includes(totalFils);
  const ready = Boolean(category) && amountsValid && payment !== null && !receiptPaidOut?.voided;

  const choices = (Object.keys(SIMPLE_PAYMENT_LABELS) as SimplePaymentChoice[])
    .filter((choice) => choice !== "till" || till);
  const fields = payment && !receiptPaidOut ? paymentFields(payment, today) : {};
  const description = supplier.trim()
    ? `Bill from ${supplier.trim()}`.slice(0, 240)
    : category ? categoryLabel(category.name) : "Bill";
  const linesJson = useMemo(() => JSON.stringify((defaults.lines ?? []).map((line) => ({
    description: line.description,
    quantity: line.quantity ?? "",
    unit: line.unit ?? "",
    unitPrice: filsToInput(line.unit_price_fils),
    amount: filsToInput(line.amount_fils),
    tax: filsToInput(line.tax_fils),
    classification: line.classification
  }))), [defaults.lines]);

  const action = kind === "document" ? approveFinanceDocumentAction : createFinanceExpenseAction;
  const saveLabel = kind === "manual" && !canApprove ? "Save – a manager will check it" : "Save bill";

  return (
    <form action={action} className="space-y-6">
      {/* Fields the existing Finance actions expect, filled from the answers below. */}
      {kind === "document" ? (
        <>
          <input name="document_id" type="hidden" value={documentId} />
          <input name="lines_json" type="hidden" value={linesJson} />
          <input name="subtotal" type="hidden" value={amountsValid ? filsToInput(totalFils! - vatFils!) : ""} />
          <input name="vat" type="hidden" value={amountsValid ? filsToInput(vatFils) : ""} />
          <input name="total" type="hidden" value={total} />
          <input name="invoice_number" type="hidden" value={defaults.invoiceNumber ?? ""} />
        </>
      ) : (
        <>
          <input name="amount" type="hidden" value={total} />
          <input name="status" type="hidden" value={canApprove ? "approved" : "draft"} />
          {includesVat ? <input name="vat_inclusive" type="hidden" value="on" /> : null}
        </>
      )}
      <input name="description" type="hidden" value={description} />
      <input name="category_id" type="hidden" value={categoryId} />
      <input name="incurred_on" type="hidden" value={billDate} />
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
      {payment === "till" && till && !receiptPaidOut ? <input name="till_shift_id" type="hidden" value={till.shiftId} /> : null}

      <section>
        <h2 className="text-lg font-black text-ink">1. Who is it from?</h2>
        <input
          className="focus-ring mt-2 block w-full rounded-xl border border-stone-300 px-4 py-3 text-base"
          maxLength={160}
          name="supplier_name"
          onChange={(event) => setSupplier(event.target.value)}
          placeholder="Shop or supplier name (optional)"
          value={supplier}
        />
      </section>

      <section>
        <h2 className="text-lg font-black text-ink">2. What is it for?</h2>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {categories.map((item) => (
            <button
              aria-pressed={categoryId === item.id}
              className={`focus-ring flex min-h-[64px] items-center gap-2 rounded-xl border-2 px-3 py-3 text-left text-sm font-black ${categoryId === item.id ? "border-leaf bg-mint/60 text-ink" : "border-stone-200 bg-white text-stone-700"}`}
              key={item.id}
              onClick={() => setCategoryId(item.id)}
              type="button"
            >
              <span aria-hidden className="text-2xl">{categoryIcon(item.name)}</span>
              <span>{categoryLabel(item.name)}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-black text-ink">3. Total amount</h2>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-lg font-black text-stone-500">AED</span>
          <input
            className="focus-ring block w-full rounded-xl border border-stone-300 px-4 py-3 text-2xl font-black"
            inputMode="decimal"
            onChange={(event) => setTotal(event.target.value)}
            placeholder="0.00"
            value={total}
          />
        </div>
        <p className="mt-1 text-xs text-stone-500">The full amount on the bill, including any VAT.</p>
        {total && totalFils === null ? <p className="mt-1 text-sm font-bold text-red-700">Enter a number like 52.50</p> : null}
      </section>

      <section>
        <h2 className="text-lg font-black text-ink">4. How did you pay?</h2>
        {receiptPaidOut ? (
          <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
            <p className="font-black">💵 Cash from the till – already recorded</p>
            <p className="mt-1">{formatFils(receiptPaidOut.amountFils)} was taken from the till for “{receiptPaidOut.reason}”.</p>
            {receiptPaidOut.voided ? <p className="mt-2 font-bold text-red-700">That till payment was cancelled, so this receipt can’t be saved. Ask a manager.</p> : null}
            {mismatch ? (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
                <p className="font-bold">The bill total is different from the {formatFils(receiptPaidOut.amountFils)} taken from the till.</p>
                <label className="mt-2 flex items-start gap-2 font-bold">
                  <input className="mt-0.5 h-5 w-5" name="confirm_mismatch" required type="checkbox" />
                  Yes, this is the right bill
                </label>
                <input className="focus-ring mt-2 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2" maxLength={300} name="mismatch_reason" placeholder="Why is it different? e.g. part paid by card" required />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {choices.map((choice) => (
              <button
                aria-pressed={payment === choice}
                className={`focus-ring flex min-h-[56px] items-center gap-3 rounded-xl border-2 px-3 py-3 text-left text-sm font-black ${payment === choice ? "border-leaf bg-mint/60 text-ink" : "border-stone-200 bg-white text-stone-700"}`}
                key={choice}
                onClick={() => setPayment(choice)}
                type="button"
              >
                <span aria-hidden className="text-2xl">{SIMPLE_PAYMENT_LABELS[choice].icon}</span>
                <span>
                  {SIMPLE_PAYMENT_LABELS[choice].label}
                  {choice === "till" && till ? <span className="block text-xs font-normal text-stone-500">{till.label}</span> : null}
                </span>
              </button>
            ))}
          </div>
        )}
        {sameAmountAtTill ? (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-bold">Cash of this amount was already taken from the till without a bill. Is this the same payment?</p>
            <p className="mt-1">If yes, choose a different option here and match the bill on the “Till payments” page.</p>
            <label className="mt-2 flex items-start gap-2 font-bold">
              <input className="mt-0.5 h-5 w-5" name="confirm_new_paid_out" required type="checkbox" />
              No – this is a separate payment
            </label>
          </div>
        ) : null}
      </section>

      {possibleDuplicate ? (
        <label className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">
          <input className="mt-0.5 h-5 w-5" name="confirm_possible_duplicate" required type="checkbox" />
          A similar bill was saved before. I checked – this is a different bill.
        </label>
      ) : null}

      <details className="rounded-xl border border-stone-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-black text-stone-700">More details (optional)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold">Bill date
            <input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" onChange={(event) => setBillDate(event.target.value)} type="date" value={billDate} />
          </label>
          {kind === "document" ? (
            <label className="text-sm font-bold">VAT on the bill (AED)
              <input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" inputMode="decimal" onChange={(event) => setVat(event.target.value)} value={vat} />
              {vatFils === null || (totalFils !== null && vatFils !== null && vatFils > totalFils) ? <span className="mt-1 block text-xs font-bold text-red-700">VAT must be a number no bigger than the total.</span> : null}
            </label>
          ) : (
            <label className="flex items-center gap-2 self-end pb-3 text-sm font-bold">
              <input checked={includesVat} className="h-5 w-5" onChange={(event) => setIncludesVat(event.target.checked)} type="checkbox" />
              The bill shows 5% VAT
            </label>
          )}
        </div>
      </details>

      <div>
        <SaveButton disabled={!ready} label={saveLabel} />
        {!ready && !receiptPaidOut?.voided ? (
          <p className="mt-2 text-center text-xs text-stone-500">
            {!category ? "Choose what the bill is for. " : ""}
            {!amountsValid ? "Enter the total. " : ""}
            {payment === null ? "Choose how you paid." : ""}
          </p>
        ) : null}
      </div>
    </form>
  );
}
