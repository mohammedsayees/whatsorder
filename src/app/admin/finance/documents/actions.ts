"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { isIsoDate, parseAedToFils, parseAedToFilsAllowZero, requiredText } from "@/lib/finance";
import { processFinanceExtractionJob } from "@/lib/finance-extraction";
import { FINANCE_DOCUMENT_BUCKET, inspectFinanceUpload } from "@/lib/finance-upload";
import { requireFinancePermission } from "@/lib/finance-data";
import { getSupabaseAdmin } from "@/lib/supabase";

const reviewPath = (documentId: string) => `/admin/finance/documents/${documentId}`;

function fail(path: string, message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
}

function extractionMessage(code: string) {
  if (code === "not_configured") return "Bill extraction is not configured. Add this expense manually for now.";
  if (code === "provider_busy") return "The bill reader is busy. Retry in a moment.";
  if (code === "invalid_response") return "The bill reader returned uncertain data. Retry or enter it manually.";
  if (code === "not_claimed") return "This bill is still being read. Reload in a moment.";
  return "The bill could not be read. Retry or enter it manually.";
}

export async function uploadFinanceDocumentAction(formData: FormData) {
  const { session, access } = await requireFinancePermission("create");
  const admin = getSupabaseAdmin();
  if (!admin) fail("/admin/finance", "Finance document storage is unavailable.");
  const file = formData.get("bill");
  if (!(file instanceof File)) fail("/admin/finance", "Choose a bill image or PDF.");

  const { data: allowed, error: rateError } = await admin.rpc("check_finance_scan_rate_limit", {
    target_restaurant_id: session.restaurantId,
    target_user_id: session.userId
  });
  if (rateError) fail("/admin/finance", "The upload limit could not be checked. Try again.");
  if (allowed !== true) fail("/admin/finance", "Too many bill scans. Wait before trying again.");

  let inspected;
  try {
    inspected = await inspectFinanceUpload(file);
  } catch (error) {
    fail("/admin/finance", error instanceof Error ? error.message : "That file could not be opened.");
  }

  const documentId = randomUUID();
  const storagePath = `${session.restaurantId}/${documentId}.${inspected.extension}`;
  const { error: uploadError } = await admin.storage
    .from(FINANCE_DOCUMENT_BUCKET)
    .upload(storagePath, inspected.bytes, {
      contentType: inspected.contentType,
      upsert: false
    });
  if (uploadError) fail("/admin/finance", "The private bill upload failed. Try again.");

  const { error: createError } = await admin.rpc("create_finance_document_job", {
    target_restaurant_id: session.restaurantId,
    requested_document_id: documentId,
    requested_storage_path: storagePath,
    requested_original_name: inspected.originalName,
    requested_mime_type: inspected.contentType,
    requested_byte_size: inspected.originalByteSize,
    requested_page_count: inspected.pageCount,
    requested_file_hash: inspected.originalHash,
    event_actor_user_id: session.userId
  });
  if (createError) {
    await admin.storage.from(FINANCE_DOCUMENT_BUCKET).remove([storagePath]);
    fail("/admin/finance", "The bill could not be queued. Try again.");
  }

  // Runs within this request's maxDuration (set on /admin/finance, which hosts
  // the upload form). Reuse the bytes already in memory instead of re-downloading.
  after(async () => {
    await processFinanceExtractionJob(session.restaurantId, documentId, {
      bytes: inspected.bytes,
      mimeType: inspected.contentType
    });
  });
  revalidatePath("/admin/finance");
  redirect(access.view
    ? `${reviewPath(documentId)}?success=${encodeURIComponent("Bill uploaded and queued for reading.")}`
    : `/admin/finance?success=${encodeURIComponent("Bill uploaded for management review.")}`
  );
}

export async function retryFinanceExtractionAction(formData: FormData) {
  const { session } = await requireFinancePermission("create");
  const admin = getSupabaseAdmin();
  const documentId = String(formData.get("document_id") ?? "");
  const path = reviewPath(documentId);
  if (!admin || !documentId) fail("/admin/finance", "Finance extraction is unavailable.");
  const { data: document } = await admin
    .from("finance_documents")
    .select("id,status")
    .eq("id", documentId)
    .eq("restaurant_id", session.restaurantId)
    .maybeSingle();
  // "processing" is allowed so a read cut off mid-flight can be recovered; the
  // claim RPC still refuses a job whose lease is fresh (another read running).
  if (!document || !["queued", "processing", "failed"].includes(String(document.status))) {
    fail(path, "This bill is not available for retry.");
  }
  const result = await processFinanceExtractionJob(session.restaurantId, documentId);
  revalidatePath(path);
  if (!result.ok) fail(path, extractionMessage(result.error));
  redirect(`${path}?success=${encodeURIComponent("Bill read successfully. Review every field before approval.")}`);
}

type ReviewLine = {
  description?: unknown;
  quantity?: unknown;
  unit?: unknown;
  unitPrice?: unknown;
  amount?: unknown;
  tax?: unknown;
  classification?: unknown;
};

function normalizeReviewLines(value: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length > 100) return null;
  const result: Record<string, unknown>[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") return null;
    const raw = item as ReviewLine;
    const description = requiredText(raw.description, 240);
    const amountFils = parseAedToFilsAllowZero(raw.amount);
    const taxFils = raw.tax === null || String(raw.tax ?? "").trim() === ""
      ? 0
      : parseAedToFilsAllowZero(raw.tax);
    const unitPriceFils = raw.unitPrice === null || String(raw.unitPrice ?? "").trim() === ""
      ? null
      : parseAedToFilsAllowZero(raw.unitPrice);
    const quantity = String(raw.quantity ?? "").trim();
    const classification = String(raw.classification ?? "expense");
    if (!description || amountFils === null || taxFils === null || unitPriceFils === null && String(raw.unitPrice ?? "").trim()) return null;
    if (quantity && (!/^\d{1,10}(?:\.\d{1,4})?$/.test(quantity) || Number(quantity) <= 0)) return null;
    if (!["expense", "purchase", "fee", "discount", "other"].includes(classification)) return null;
    result.push({
      description,
      quantity: quantity || null,
      unit: requiredText(raw.unit, 40),
      unit_price_fils: unitPriceFils,
      amount_fils: amountFils,
      tax_fils: taxFils,
      classification
    });
  }
  return result;
}

export async function approveFinanceDocumentAction(formData: FormData) {
  const { session } = await requireFinancePermission("approve");
  const admin = getSupabaseAdmin();
  const documentId = String(formData.get("document_id") ?? "");
  const path = reviewPath(documentId);
  if (!admin || !documentId) fail("/admin/finance", "Finance approval is unavailable.");

  const categoryId = String(formData.get("category_id") ?? "");
  const supplierName = requiredText(formData.get("supplier_name"), 160) ?? "";
  const invoiceNumber = requiredText(formData.get("invoice_number"), 100) ?? "";
  const incurredOn = String(formData.get("incurred_on") ?? "");
  const description = requiredText(formData.get("description"), 240);
  const subtotalFils = parseAedToFilsAllowZero(formData.get("subtotal"));
  const vatFils = parseAedToFilsAllowZero(formData.get("vat"));
  const totalFils = parseAedToFils(formData.get("total"));
  const paymentStatus = String(formData.get("payment_status") ?? "unpaid");
  const paymentMethod = String(formData.get("payment_method") ?? "");
  const paidOn = String(formData.get("paid_on") ?? "");
  const lines = normalizeReviewLines(String(formData.get("lines_json") ?? "[]"));
  if (!description || !isIsoDate(incurredOn)) fail(path, "Enter a valid date and description.");
  if (subtotalFils === null || vatFils === null || totalFils === null || subtotalFils + vatFils !== totalFils) {
    fail(path, "Subtotal plus VAT must exactly equal the total.");
  }
  if (!lines) fail(path, "Review the extracted line items and correct invalid amounts.");
  if (!["unpaid", "paid", "partial"].includes(paymentStatus)) fail(path, "Choose a valid payment status.");
  if (paymentMethod && !["cash", "card", "bank_transfer", "other"].includes(paymentMethod)) fail(path, "Choose a valid payment method.");
  if (paymentStatus === "paid" && !isIsoDate(paidOn)) fail(path, "Paid expenses require a paid date.");
  if (paidOn && !isIsoDate(paidOn)) fail(path, "Enter a valid paid date.");

  const [{ data: category }, { data: document }] = await Promise.all([
    admin.from("finance_categories").select("id").eq("id", categoryId).eq("restaurant_id", session.restaurantId).eq("is_active", true).maybeSingle(),
    admin.from("finance_documents").select("id,status,duplicate_of_document_id").eq("id", documentId).eq("restaurant_id", session.restaurantId).maybeSingle()
  ]);
  if (!category || !document || document.status !== "extracted") fail(path, "This bill or category is no longer available.");
  if (document.duplicate_of_document_id) {
    const { data: exactDuplicate } = await admin
      .from("finance_expenses")
      .select("id")
      .eq("restaurant_id", session.restaurantId)
      .eq("source_document_id", document.duplicate_of_document_id)
      .neq("status", "void")
      .maybeSingle();
    if (exactDuplicate) fail(path, "This exact bill file has already been posted. Use the existing expense.");
  }

  let possibleDuplicateQuery = admin
    .from("finance_expenses")
    .select("id")
    .eq("restaurant_id", session.restaurantId)
    .neq("status", "void");
  possibleDuplicateQuery = invoiceNumber
    ? possibleDuplicateQuery.ilike("invoice_number", invoiceNumber)
    : possibleDuplicateQuery.eq("incurred_on", incurredOn).eq("total_fils", totalFils);
  const { data: possibleDuplicates } = await possibleDuplicateQuery.limit(1);
  if ((possibleDuplicates?.length ?? 0) > 0 && formData.get("confirm_possible_duplicate") !== "on") {
    fail(path, "A similar expense already exists. Review the warning and explicitly confirm if this is a different bill.");
  }

  const { data: expenseId, error } = await admin.rpc("approve_finance_document", {
    target_restaurant_id: session.restaurantId,
    target_document_id: documentId,
    requested_category_id: categoryId,
    requested_supplier_name: supplierName,
    requested_invoice_number: invoiceNumber,
    requested_incurred_on: incurredOn,
    requested_subtotal_fils: subtotalFils,
    requested_input_vat_fils: vatFils,
    requested_total_fils: totalFils,
    requested_vat_inclusive: formData.get("vat_inclusive") === "on",
    requested_payment_status: paymentStatus,
    requested_payment_method: paymentMethod,
    requested_paid_on: paidOn || null,
    requested_description: description,
    requested_lines: lines,
    event_actor_user_id: session.userId
  });
  if (error || !expenseId) fail(path, "The reviewed bill could not be posted. Check the fields and try again.");
  revalidatePath("/admin/finance");
  redirect(`/admin/finance?success=${encodeURIComponent("Reviewed bill posted as an approved expense.")}`);
}

export async function deleteFinanceDocumentAction(formData: FormData) {
  const { session } = await requireFinancePermission("approve");
  const admin = getSupabaseAdmin();
  const documentId = String(formData.get("document_id") ?? "");
  const path = reviewPath(documentId);
  if (!admin || !documentId) fail("/admin/finance", "Document deletion is unavailable.");
  const { data: document } = await admin
    .from("finance_documents")
    .select("storage_path,status")
    .eq("id", documentId)
    .eq("restaurant_id", session.restaurantId)
    .maybeSingle();
  if (!document || document.status === "reviewed") fail(path, "Posted bill attachments cannot be deleted from this screen.");
  const { error: removeError } = await admin.storage
    .from(FINANCE_DOCUMENT_BUCKET)
    .remove([String(document.storage_path)]);
  if (removeError) fail(path, "The private attachment could not be deleted.");
  const { error } = await admin
    .from("finance_documents")
    .update({ status: "deleted", deleted_at: new Date().toISOString(), extracted_json: null, extraction_warnings: [] })
    .eq("id", documentId)
    .eq("restaurant_id", session.restaurantId);
  if (error) fail(path, "The document record could not be deleted.");
  revalidatePath("/admin/finance");
  redirect(`/admin/finance?success=${encodeURIComponent("Unposted bill deleted.")}`);
}
