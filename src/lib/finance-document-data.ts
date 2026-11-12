import "server-only";

import type { FinanceDocument } from "@/lib/finance-document";
import { FINANCE_DOCUMENT_BUCKET } from "@/lib/finance-upload";
import { getSupabaseAdmin } from "@/lib/supabase";

export type FinanceDocumentReview = FinanceDocument & {
  signedUrl: string | null;
  attempts: number;
  possibleDuplicateExpenseIds: string[];
  // When the current read started (job lease, else upload time), and whether it
  // has evidently died: a lease past the claim RPC's 10-minute expiry, or a job
  // that was never claimed because the post-upload read did not run.
  readingStartedAt: string;
  readingStalled: boolean;
};

const STALE_LEASE_MS = 10 * 60 * 1000;
const UNCLAIMED_GRACE_MS = 2 * 60 * 1000;

export async function getFinanceDocuments(restaurantId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const { data } = await admin
    .from("finance_documents")
    .select("id,restaurant_id,storage_path,original_name,mime_type,byte_size,page_count,file_hash,status,duplicate_of_document_id,confidence,extracted_json,extraction_warnings,error_code,retention_until,created_at")
    .eq("restaurant_id", restaurantId)
    .neq("status", "deleted")
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []) as unknown as FinanceDocument[];
}

export async function getFinanceDocumentReview(
  restaurantId: string,
  documentId: string
): Promise<FinanceDocumentReview | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const [{ data: document }, { data: job }] = await Promise.all([
    admin
      .from("finance_documents")
      .select("id,restaurant_id,storage_path,original_name,mime_type,byte_size,page_count,file_hash,status,duplicate_of_document_id,confidence,extracted_json,extraction_warnings,error_code,retention_until,created_at")
      .eq("restaurant_id", restaurantId)
      .eq("id", documentId)
      .neq("status", "deleted")
      .maybeSingle(),
    admin
      .from("finance_extraction_jobs")
      .select("attempts,status,locked_at")
      .eq("restaurant_id", restaurantId)
      .eq("document_id", documentId)
      .maybeSingle()
  ]);
  if (!document) return null;
  const row = document as unknown as FinanceDocument;
  const signedResult = await admin.storage
    .from(FINANCE_DOCUMENT_BUCKET)
    .createSignedUrl(row.storage_path, 5 * 60);

  const extracted = row.extracted_json;
  let possibleDuplicateExpenseIds: string[] = [];
  if (extracted?.invoice_number || extracted?.total_fils) {
    let query = admin
      .from("finance_expenses")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .neq("status", "void");
    if (extracted.invoice_number) {
      query = query.ilike("invoice_number", extracted.invoice_number);
    } else if (extracted.invoice_date) {
      query = query
        .eq("incurred_on", extracted.invoice_date)
        .eq("total_fils", extracted.total_fils);
    }
    const { data: matches } = await query.limit(10);
    possibleDuplicateExpenseIds = (matches ?? []).map((item) => String(item.id));
  }

  return {
    ...row,
    signedUrl: signedResult.data?.signedUrl ?? null,
    attempts: Number(job?.attempts ?? 0),
    possibleDuplicateExpenseIds,
    ...financeReadingState(row.created_at, job)
  };
}

export function financeReadingState(
  uploadedAt: string,
  job: { status?: unknown; locked_at?: unknown } | null
) {
  const lockedAt = typeof job?.locked_at === "string" ? job.locked_at : null;
  const readingStartedAt = job?.status === "running" && lockedAt ? lockedAt : uploadedAt;
  const age = Date.now() - new Date(readingStartedAt).getTime();
  const readingStalled =
    (job?.status === "running" && age > STALE_LEASE_MS) ||
    (job?.status === "queued" && age > UNCLAIMED_GRACE_MS);
  return { readingStartedAt, readingStalled };
}
