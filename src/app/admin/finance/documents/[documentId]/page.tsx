import Link from "next/link";
import { notFound } from "next/navigation";
import { RefreshCw, Trash2 } from "lucide-react";
import {
  deleteFinanceDocumentAction,
  retryFinanceExtractionAction
} from "@/app/admin/finance/documents/actions";
import { FinanceBillReviewForm } from "@/components/admin/FinanceBillReviewForm";
import { formatFils } from "@/lib/finance";
import { getFinanceDocumentReview } from "@/lib/finance-document-data";
import { getFinanceCategories, requireFinancePermission } from "@/lib/finance-data";

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
  const [document, categories] = await Promise.all([
    getFinanceDocumentReview(session.restaurantId, route.documentId),
    getFinanceCategories(session.restaurantId)
  ]);
  if (!document) notFound();
  const exactDuplicate = Boolean(document.duplicate_of_document_id);
  const possibleDuplicate = exactDuplicate || document.possibleDuplicateExpenseIds.length > 0;

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
          {document.status === "queued" || document.status === "processing" ? <div className="py-10 text-center"><RefreshCw className="mx-auto animate-spin text-leaf" size={28} /><h2 className="mt-3 text-lg font-black">Reading bill</h2><p className="mt-1 text-sm text-stone-500">The durable extraction job is {document.status}. Reload shortly.</p><Link className="focus-ring mt-4 inline-block rounded-lg border border-stone-300 px-4 py-2 text-sm font-black" href={`/admin/finance/documents/${document.id}`}>Reload status</Link></div> : null}
          {document.status === "failed" ? <div className="py-8 text-center"><h2 className="text-lg font-black">Automatic reading failed</h2><p className="mt-2 text-sm text-stone-500">No expense was created. Attempt {document.attempts} of 3.</p>{access.create && document.attempts < 3 ? <form action={retryFinanceExtractionAction} className="mt-4"><input name="document_id" type="hidden" value={document.id} /><button className="focus-ring rounded-lg bg-leaf px-4 py-3 text-sm font-black text-white" type="submit">Retry secure extraction</button></form> : <Link className="focus-ring mt-4 inline-block rounded-lg border border-stone-300 px-4 py-3 text-sm font-black" href="/admin/finance/new">Enter manually</Link>}</div> : null}
          {document.status === "reviewed" ? <div className="py-8 text-center"><h2 className="text-lg font-black">Bill already posted</h2><p className="mt-2 text-sm text-stone-500">Idempotent approval prevents this document from creating another expense.</p><Link className="focus-ring mt-4 inline-block rounded-lg bg-ink px-4 py-3 text-sm font-black text-white" href="/admin/finance">View expenses</Link></div> : null}
          {document.status === "extracted" && document.extracted_json ? <div><div className="mb-5 border-b border-stone-100 pb-4"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black">Review extracted fields</h2><span className={`rounded-full px-2.5 py-1 text-xs font-black ${document.confidence === "high" ? "bg-emerald-100 text-emerald-800" : document.confidence === "low" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{document.confidence ?? "unknown"} confidence</span></div><p className="mt-1 text-sm text-stone-500">Printed total: {formatFils(Number(document.extracted_json.total_fils))}. Correct every uncertain field.</p>{document.extraction_warnings.length > 0 ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">{document.extraction_warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}</div>{access.approve ? <FinanceBillReviewForm categories={categories} document={document} possibleDuplicate={possibleDuplicate} /> : <p className="rounded-lg bg-amber-50 p-4 text-sm font-bold text-amber-900">You may view extracted data but do not have approval permission.</p>}</div> : null}
        </section>
      </div>
    </main>
  );
}
