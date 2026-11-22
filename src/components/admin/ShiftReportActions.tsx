"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { FileDown, Loader2, MessageCircle, PencilLine, Printer } from "lucide-react";
import {
  reviseShiftReportAction,
  type ShiftActionState
} from "@/app/admin/shifts/actions";
import { MarketplaceReconciliationFields } from "@/components/admin/ShiftForms";
import {
  changeOrderPaymentMethodAction,
  type ChangePaymentState
} from "@/app/admin/orders/actions";
import { printHtmlDocument } from "@/lib/print-ticket";
import { renderShiftCloseThermalReport } from "@/lib/shift-report-print";
import type { CashDenominationCount } from "@/lib/cash-denominations";
import type { ShiftCloseReportSnapshot } from "@/lib/types";

const initialState: ShiftActionState = {};

export function ShiftReportActions({
  autoPrintThermal,
  cashDenominations = null,
  report,
  shareUrl
}: {
  autoPrintThermal: boolean;
  /** Notes-and-coins breakdown locked at close, printed under the cash drawer. */
  cashDenominations?: CashDenominationCount[] | null;
  report: ShiftCloseReportSnapshot;
  shareUrl: string | null;
}) {
  const autoPrintStarted = useRef(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const printThermal = useCallback(() => {
    setPrintError(null);
    printHtmlDocument(
      renderShiftCloseThermalReport(report, { cashDenominations }),
      setPrintError,
      // One continuous slip, however long the shift report is.
      { singlePageWidthMm: 80 }
    );
  }, [cashDenominations, report]);

  useEffect(() => {
    if (!autoPrintThermal || autoPrintStarted.current) {
      return;
    }

    autoPrintStarted.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("print");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    printThermal();
  }, [autoPrintThermal, printThermal]);

  return (
    <div className="print:hidden">
      <div className="flex flex-wrap gap-2">
        <button
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-black text-white"
          onClick={printThermal}
          type="button"
        >
          <Printer size={16} />
          Print 80 mm summary
        </button>
        <button
          className="focus-ring inline-flex items-center gap-2 rounded-lg border border-ink px-4 py-2.5 text-sm font-black"
          onClick={() => window.print()}
          type="button"
        >
          <FileDown size={16} />
          Print / save A4 PDF
        </button>
        {shareUrl ? (
          <a
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-leaf px-4 py-2.5 text-sm font-black text-white"
            href={shareUrl}
            rel="noreferrer"
            target="_blank"
          >
            <MessageCircle size={16} />
            Share summary
          </a>
        ) : null}
      </div>
      {printError ? (
        <p className="mt-2 text-xs font-bold text-rose-700" role="status">{printError}</p>
      ) : null}
    </div>
  );
}

export function ShiftReportCorrectionForm({
  report
}: {
  report: ShiftCloseReportSnapshot;
}) {
  const [state, action, pending] = useActionState(
    reviseShiftReportAction,
    initialState
  );

  return (
    <details className="rounded-lg border border-stone-200 bg-white p-4 print:hidden">
      <summary className="focus-ring flex cursor-pointer list-none items-center gap-2 font-black">
        <PencilLine size={17} />
        Correct reported totals
      </summary>
      <p className="mt-2 text-sm leading-6 text-stone-500">
        Management corrections create a new version. The original report remains in history.
      </p>
      <form action={action} className="mt-4 space-y-4">
        <input name="shift_id" type="hidden" value={report.shift_id} />
        {report.marketplace_sales.map((sale) => (
          <input
            key={sale.channel}
            name="report_marketplace_channel"
            type="hidden"
            value={sale.channel}
          />
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-stone-700">
            Cash counted
            <input
              className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-3"
              defaultValue={report.cash_counted_amount}
              min="0"
              name="cash_counted_amount"
              required
              step="0.01"
              type="number"
            />
          </label>
          <label className="text-sm font-bold text-stone-700">
            Card terminal total
            <input
              className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-3"
              defaultValue={report.card_terminal_total}
              min="0"
              name="card_terminal_total"
              required
              step="0.01"
              type="number"
            />
          </label>
        </div>
        {report.country_code === "IN" ? (
          <label className="block text-sm font-bold text-stone-700">
            UPI app / QR report total
            <input
              className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-3"
              defaultValue={report.upi_reported_total ?? 0}
              min="0"
              name="upi_reported_total"
              required
              step="0.01"
              type="number"
            />
          </label>
        ) : null}
        {report.marketplace_sales.length > 0 ? (
          <MarketplaceReconciliationFields
            channels={report.marketplace_sales.map((sale) => sale.channel)}
            initialSales={report.marketplace_sales}
          />
        ) : null}
        <label className="block text-sm font-bold text-stone-700">
          Correction reason
          <textarea
            className="focus-ring mt-1 block min-h-24 w-full rounded-lg border border-stone-200 px-3 py-3"
            maxLength={500}
            name="correction_reason"
            placeholder="What was corrected and why?"
            required
          />
        </label>
        {state.error || state.success ? (
          <p
            className={`rounded-lg px-3 py-2 text-sm font-bold ${
              state.error
                ? "bg-rose-50 text-rose-700"
                : "bg-emerald-50 text-emerald-800"
            }`}
            role="status"
          >
            {state.error ?? state.success}
          </p>
        ) : null}
        <button
          className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-3 font-black text-white disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? <Loader2 className="animate-spin" size={18} /> : null}
          Save new report version
        </button>
      </form>
    </details>
  );
}

/** One-click payment correction for an order flagged by the mix-up prompt. */
export function CorrectOrderPaymentButton({
  label,
  orderId,
  paymentMethod
}: {
  label: string;
  orderId: string;
  paymentMethod: string;
}) {
  const [state, action, pending] = useActionState<ChangePaymentState, FormData>(
    changeOrderPaymentMethodAction,
    {}
  );
  if (state.success && !state.error) {
    return <span className="text-xs font-black text-emerald-700">{state.success}</span>;
  }
  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input name="order_id" type="hidden" value={orderId} />
      <input name="payment_method" type="hidden" value={paymentMethod} />
      <button
        className="focus-ring rounded-lg border border-amber-700 bg-white px-3 py-1.5 text-xs font-black text-amber-900 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Correcting…" : label}
      </button>
      {state.error ? <span className="text-xs font-bold text-rose-700">{state.error}</span> : null}
    </form>
  );
}
