import Link from "next/link";
import { notFound } from "next/navigation";
import { RefreshCw, Trash2 } from "lucide-react";
import {
  deleteFinanceDocumentAction,
  retryFinanceExtractionAction
} from "@/app/admin/finance/documents/actions";
import { FinanceBillReadingRefresh } from "@/components/admin/FinanceBillReadingRefresh";
import { FinanceBillReviewForm } from "@/components/admin/FinanceBillReviewForm";
import { formatFils } from "@/lib/finance";
import { getFinanceDocumentReview } from "@/lib/finance-document-data";
import { getFinanceCategories, getFinanceRecurringCosts, requireFinancePermission } from "@/lib/finance-data";
import { getOpenShiftTill, getPaidOutForReceipt } from "@/lib/finance-paid-out-data";
import { formatRestaurantShortDateTime } from "@/lib/date-time";
import { SimpleBillForm } from "@/components/admin/SimpleBillForm";
import { getFinanceMode } from "@/lib/finance-mode";

export const maxDuration = 60;

export default async function FinanceDocumentReviewPage({
  params,
  searchParams
}: {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [{ session, access }, route, query] = await Promise.all([
    requireFinancePermission("view"),
    params,
    searchParams
  ]);
  const [document, categories, till, recurring] = await Promise.all([
    getFinanceDocumentReview(session.restaurantId, route.documentId),
    getFinanceCategories(session.restaurantId),
    getOpenShiftTill(session, access.approve).catch(() => null),
    getFinanceRecurringCosts(session.restaurantId)
  ]);
  if (!document) notFound();
  const receiptPaidOut = document.shift_paid_out_id
    ? await getPaidOutForReceipt(session.restaurantId, document.shift_paid_out_id)
    : null;
  const exactDuplicate = Boolean(document.duplicate_of_document_id);
  const possibleDuplicate = exactDuplicate || document.possibleDuplicateExpenseIds.length > 0;

  if ((await getFinanceMode(session)) === "simple") {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: session.restaurant.time_zone ?? "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const extracted = document.extracted_json;
    const reading = (document.status === "queued" || document.status === "processing") && !document.readingStalled;
    const unreadable = document.status === "failed" || ((document.status === "queued" || document.status === "processing") && document.readingStalled);
    return (
      <main className="mx-auto max-w-2xl px-4 py-6">
        <Link className="text-sm font-bold text-leaf" href="/admin/finance">← Back</Link>
        <h1 className="mt-3 text-3xl font-black text-ink">Check the bill</h1>
        {query.error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{query.error}</p> : null}
        {query.success && !reading ? <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">✓ {query.success}</p> : null}
        {exactDuplicate ? <p className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">This exact photo was uploaded before. If that one was saved, this one can’t be saved again.</p> : null}

        {document.signedUrl ? (
          <details className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-white">
            <summary className="cursor-pointer px-4 py-3 text-sm font-black">📄 See the bill photo</summary>
            {document.mime_type === "application/pdf"
              ? <iframe className="h-[60vh] w-full bg-white" src={document.signedUrl} title="Bill PDF" />
              : <picture><img alt="Bill" className="h-auto max-h-[60vh] w-full object-contain" src={document.signedUrl} /></picture>}
          </details>
        ) : null}

        {reading ? (
          <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-10 text-center">
            <FinanceBillReadingRefresh startedAt={document.readingStartedAt} />
            <RefreshCw className="mx-auto animate-spin text-leaf" size={28} />
            <h2 className="mt-3 text-lg font-black">Reading the bill…</h2>
            <p className="mt-1 text-sm text-stone-600">This takes about half a minute. The page updates by itself.</p>
          </div>
        ) : null}

        {unreadable ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-8 text-center">
            <h2 className="text-lg font-black">Couldn’t read this photo</h2>
            <p className="mt-1 text-sm text-stone-600">Try again, or type the bill in yourself.</p>
            <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
              {access.create && document.attempts < 3 ? <form action={retryFinanceExtractionAction}><input name="document_id" type="hidden" value={document.id} /><button className="focus-ring w-full rounded-xl bg-leaf px-4 py-3 text-sm font-black text-white" type="submit">Try reading again</button></form> : null}
              <Link className="focus-ring rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-black" href="/admin/finance/new">Type it in instead</Link>
            </div>
          </div>
        ) : null}

        {document.status === "reviewed" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
            <h2 className="text-lg font-black">This bill is already saved ✓</h2>
            <Link className="focus-ring mt-4 inline-block rounded-xl bg-ink px-4 py-3 text-sm font-black text-white" href="/admin/finance">Back to Money</Link>
          </div>
        ) : null}

        {document.status === "extracted" && extracted ? (
          access.approve ? (
            <div className="mt-6">
              <p className="mb-4 text-sm text-stone-600">We read the bill for you. Check the answers and tap Save.</p>
              <SimpleBillForm
                canApprove
                categories={categories.map((category) => ({ id: category.id, name: category.name }))}
                defaults={{
                  supplier: extracted.supplier_name,
                  invoiceNumber: extracted.invoice_number,
                  invoiceDate: extracted.invoice_date,
                  totalFils: Number(extracted.total_fils),
                  vatFils: Number(extracted.vat_fils ?? 0),
                  lines: extracted.lines ?? []
                }}
                documentId={document.id}
                kind="document"
                possibleDuplicate={possibleDuplicate}
                receiptPaidOut={receiptPaidOut ? { amountFils: receiptPaidOut.amountFils, reason: receiptPaidOut.reason, voided: receiptPaidOut.voided } : null}
                till={till && !receiptPaidOut ? {
                  shiftId: till.shiftId,
                  label: `${till.shiftName} shift, opened ${formatRestaurantShortDateTime(till.openedAt, session.restaurant)}`,
                  unbilledAmountsFils: till.unbilled.map((row) => row.amountFils)
                } : null}
                today={today}
              />
            </div>
          ) : <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-900">A manager will check and save this bill.</p>
        ) : null}

        {access.approve && document.status !== "reviewed" ? (
          <details className="mt-8 text-center">
            <summary className="cursor-pointer text-xs font-bold text-red-700">Delete this photo</summary>
            <form action={deleteFinanceDocumentAction} className="mt-2"><input name="document_id" type="hidden" value={document.id} /><button className="focus-ring rounded-lg border border-red-300 px-3 py-2 text-xs font-black text-red-700" type="submit">Yes, delete it (nothing was saved from it)</button></form>
          </details>
        ) : null}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <Link className="text-sm font-bold text-leaf" href="/admin/finance">← Back to Finance</Link>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-sm font-black text-leaf">Private bill review</p><h1 className="text-2xl font-black text-ink">{document.original_name}</h1><p className="mt-1 text-xs text-stone-500">{document.page_count} page{document.page_count === 1 ? "" : "s"} · retained until {document.retention_until}</p></div>
        {access.approve && document.status !== "reviewed" ? <form action={deleteFinanceDocumentAction}><input name="document_id" type="hidden" value={document.id} /><button className="focus-ring inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-700" type="submit"><Trash2 size={15} /> Delete unposted bill</button></form> : null}
      </div>
      {query.error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{query.error}</p> : null}
      {query.success ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{query.success}</p> : null}
      {exactDuplicate ? <p className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">Exact duplicate file detected. If the earlier copy was posted, this copy cannot create another expense.</p> : null}
      {!exactDuplicate && document.possibleDuplicateExpenseIds.length > 0 ? <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">A similar invoice number or date/amount already exists. Confirm it is genuinely different before posting.</p> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,1fr)]">
        <section className="overflow-hidden rounded-xl border border-stone-200 bg-stone-100 shadow-sm">
          <div className="border-b border-stone-200 bg-white px-4 py-3"><h2 className="font-black">Attachment preview</h2><p className="text-xs text-stone-500">Five-minute authorized link; the storage bucket is private.</p></div>
          {document.signedUrl ? document.mime_type === "application/pdf" ? <iframe className="h-[70vh] w-full bg-white" src={document.signedUrl} title="Uploaded bill PDF" /> : <picture><img alt="Uploaded bill" className="h-auto max-h-[70vh] w-full object-contain" src={document.signedUrl} /></picture> : <p className="p-8 text-center text-sm text-stone-500">Preview is temporarily unavailable.</p>}
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          {(document.status === "queued" || document.status === "processing") && !document.readingStalled ? <div className="py-10 text-center"><FinanceBillReadingRefresh startedAt={document.readingStartedAt} /><RefreshCw className="mx-auto animate-spin text-leaf" size={28} /><h2 className="mt-3 text-lg font-black">Reading bill</h2><p className="mt-1 text-sm text-stone-500">This page updates automatically for about a minute.</p><Link className="focus-ring mt-4 inline-block rounded-lg border border-stone-300 px-4 py-2 text-sm font-black" href={`/admin/finance/documents/${document.id}`}>Reload status</Link></div> : null}
          {(document.status === "queued" || document.status === "processing") && document.readingStalled ? <div className="py-8 text-center"><h2 className="text-lg font-black">Reading did not finish</h2><p className="mt-2 text-sm text-stone-500">No expense was created. Attempt {document.attempts} of 3.</p>{access.create && document.attempts < 3 ? <form action={retryFinanceExtractionAction} className="mt-4"><input name="document_id" type="hidden" value={document.id} /><button className="focus-ring rounded-lg bg-leaf px-4 py-3 text-sm font-black text-white" type="submit">Retry secure extraction</button></form> : <Link className="focus-ring mt-4 inline-block rounded-lg border border-stone-300 px-4 py-3 text-sm font-black" href="/admin/finance/new">Enter manually</Link>}</div> : null}
          {document.status === "failed" ? <div className="py-8 text-center"><h2 className="text-lg font-black">Automatic reading failed</h2><p className="mt-2 text-sm text-stone-500">No expense was created. Attempt {document.attempts} of 3.</p>{access.create && document.attempts < 3 ? <form action={retryFinanceExtractionAction} className="mt-4"><input name="document_id" type="hidden" value={document.id} /><button className="focus-ring rounded-lg bg-leaf px-4 py-3 text-sm font-black text-white" type="submit">Retry secure extraction</button></form> : <Link className="focus-ring mt-4 inline-block rounded-lg border border-stone-300 px-4 py-3 text-sm font-black" href="/admin/finance/new">Enter manually</Link>}</div> : null}
          {document.status === "reviewed" ? <div className="py-8 text-center"><h2 className="text-lg font-black">Bill already posted</h2><p className="mt-2 text-sm text-stone-500">Idempotent approval prevents this document from creating another expense.</p><Link className="focus-ring mt-4 inline-block rounded-lg bg-ink px-4 py-3 text-sm font-black text-white" href="/admin/finance">View expenses</Link></div> : null}
          {document.status === "extracted" && document.extracted_json ? <div><div className="mb-5 border-b border-stone-100 pb-4"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black">Review extracted fields</h2><span className={`rounded-full px-2.5 py-1 text-xs font-black ${document.confidence === "high" ? "bg-emerald-100 text-emerald-800" : document.confidence === "low" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{document.confidence ?? "unknown"} confidence</span></div><p className="mt-1 text-sm text-stone-500">Printed total: {formatFils(Number(document.extracted_json.total_fils))}. Correct every uncertain field.</p>{document.extraction_warnings.length > 0 ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">{document.extraction_warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}</div>{access.approve ? <FinanceBillReviewForm categories={categories} document={document} possibleDuplicate={possibleDuplicate} receiptPaidOut={receiptPaidOut} recurringCosts={recurring.filter((cost) => cost.is_active).map((cost) => ({ id: cost.id, description: cost.description }))} receiptRecordedAtLabel={receiptPaidOut ? formatRestaurantShortDateTime(receiptPaidOut.recordedAt, session.restaurant) : ""} till={receiptPaidOut ? null : till} tillOpenedAtLabel={till ? formatRestaurantShortDateTime(till.openedAt, session.restaurant) : ""} /> : <p className="rounded-lg bg-amber-50 p-4 text-sm font-bold text-amber-900">You may view extracted data but do not have approval permission.</p>}</div> : null}
        </section>
      </div>
    </main>
  );
}
