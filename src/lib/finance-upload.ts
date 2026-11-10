import "server-only";

import { createHash } from "node:crypto";
import { normalizeImageUpload } from "@/lib/server-image-upload";

export const FINANCE_DOCUMENT_BUCKET = "finance-documents";
export const FINANCE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const FINANCE_DOCUMENT_MAX_PAGES = 10;

export type InspectedFinanceUpload = {
  bytes: Buffer;
  contentType: "image/webp" | "application/pdf";
  extension: "webp" | "pdf";
  originalName: string;
  originalHash: string;
  originalByteSize: number;
  pageCount: number;
};

function safeFilename(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\s+/g, " ").trim();
  return (cleaned || "bill").slice(0, 180);
}

function looksLikePdf(bytes: Buffer) {
  return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
}

async function inspectPdf(bytes: Buffer) {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      stopAtErrors: true
    });
    const pdf = await task.promise;
    const count = pdf.numPages;
    await pdf.destroy();
    if (count < 1 || count > FINANCE_DOCUMENT_MAX_PAGES) {
      throw new Error(`PDFs can contain up to ${FINANCE_DOCUMENT_MAX_PAGES} pages.`);
    }
    return count;
  } catch (error) {
    if (error instanceof Error && error.message.includes("pages")) throw error;
    throw new Error("The selected file is not a readable PDF.");
  }
}

export async function inspectFinanceUpload(file: File): Promise<InspectedFinanceUpload> {
  if (file.size === 0) throw new Error("Please choose a bill to upload.");
  if (file.size > FINANCE_DOCUMENT_MAX_BYTES) throw new Error("Bills must be 10MB or smaller.");
  const original = Buffer.from(await file.arrayBuffer());
  const originalHash = createHash("sha256").update(original).digest("hex");
  const originalName = safeFilename(file.name || "bill");

  if (looksLikePdf(original)) {
    const pageCount = await inspectPdf(original);
    return {
      bytes: original,
      contentType: "application/pdf",
      extension: "pdf",
      originalName,
      originalHash,
      originalByteSize: file.size,
      pageCount
    };
  }

  const normalized = await normalizeImageUpload(file, {
    maximumBytes: FINANCE_DOCUMENT_MAX_BYTES,
    maximumEdge: 2200
  });
  return {
    ...normalized,
    originalName,
    originalHash,
    originalByteSize: file.size,
    pageCount: 1
  };
}
