import { isIsoDate, parseAedToFils, parseAedToFilsAllowZero, requiredText } from "@/lib/finance";

export type FinanceExtractedLine = {
  description: string;
  quantity: string | null;
  unit: string | null;
  unitPriceFils: number | null;
  amountFils: number;
  taxFils: number;
  classification: "expense" | "purchase" | "fee" | "discount" | "other";
};

export type FinanceExtraction = {
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  currency: "AED";
  subtotalFils: number;
  vatFils: number;
  totalFils: number;
  vatInclusive: boolean;
  confidence: "high" | "medium" | "low";
  lines: FinanceExtractedLine[];
  warnings: string[];
};

export type FinanceDocument = {
  id: string;
  restaurant_id: string;
  storage_path: string;
  original_name: string;
  mime_type: "image/webp" | "application/pdf";
  byte_size: number;
  page_count: number;
  file_hash: string;
  status: "queued" | "processing" | "extracted" | "failed" | "reviewed" | "deleted";
  duplicate_of_document_id: string | null;
  confidence: "high" | "medium" | "low" | null;
  extracted_json: ReturnType<typeof financeExtractionToStorage> | null;
  extraction_warnings: string[];
  error_code: string | null;
  retention_until: string;
  created_at: string;
};

const classifications = new Set(["expense", "purchase", "fee", "discount", "other"]);

function optionalMoney(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return parseAedToFilsAllowZero(value);
}

function positiveQuantity(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const text = String(value).trim();
  if (!/^\d{1,10}(?:\.\d{1,4})?$/.test(text) || Number(text) <= 0) return null;
  return text;
}

function safeWarning(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 180) : null;
}

export function normalizeFinanceExtractionResponse(raw: unknown): FinanceExtraction | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const totalFils = parseAedToFils(record.total);
  if (totalFils === null) return null;
  const vatFils = optionalMoney(record.vat) ?? 0;
  const subtotalFils = optionalMoney(record.subtotal) ?? totalFils - vatFils;
  if (subtotalFils < 0) return null;

  const warnings = Array.isArray(record.warnings)
    ? record.warnings.map(safeWarning).filter((item): item is string => Boolean(item)).slice(0, 20)
    : [];
  if (subtotalFils + vatFils !== totalFils) {
    warnings.push("Extracted subtotal plus VAT does not equal the total; correct the amounts before approval.");
  }

  const supplierName = requiredText(record.supplier_name, 160);
  const invoiceNumber = requiredText(record.invoice_number, 100);
  const invoiceDateValue = String(record.invoice_date ?? "").trim();
  const invoiceDate = isIsoDate(invoiceDateValue) ? invoiceDateValue : null;
  if (!supplierName) warnings.push("Supplier was not confidently identified.");
  if (!invoiceDate) warnings.push("Invoice date was not confidently identified.");

  const lines: FinanceExtractedLine[] = [];
  if (Array.isArray(record.lines)) {
    for (const rawLine of record.lines.slice(0, 100)) {
      if (!rawLine || typeof rawLine !== "object") continue;
      const line = rawLine as Record<string, unknown>;
      const description = requiredText(line.description, 240);
      const amountFils = optionalMoney(line.amount);
      if (!description || amountFils === null) continue;
      const classification = String(line.classification ?? "expense");
      lines.push({
        description,
        quantity: positiveQuantity(line.quantity),
        unit: requiredText(line.unit, 40),
        unitPriceFils: optionalMoney(line.unit_price),
        amountFils,
        taxFils: optionalMoney(line.tax) ?? 0,
        classification: classifications.has(classification)
          ? (classification as FinanceExtractedLine["classification"])
          : "expense"
      });
    }
  }

  const modelConfidence = String(record.confidence ?? "");
  const confidence = modelConfidence === "high" && warnings.length === 0
    ? "high"
    : modelConfidence === "low" || warnings.length > 2
      ? "low"
      : "medium";

  return {
    supplierName,
    invoiceNumber,
    invoiceDate,
    currency: "AED",
    subtotalFils,
    vatFils,
    totalFils,
    vatInclusive: record.vat_inclusive === true,
    confidence,
    lines,
    warnings: [...new Set(warnings)].slice(0, 20)
  };
}

export function financeExtractionToStorage(extraction: FinanceExtraction) {
  return {
    supplier_name: extraction.supplierName,
    invoice_number: extraction.invoiceNumber,
    invoice_date: extraction.invoiceDate,
    currency: extraction.currency,
    subtotal_fils: extraction.subtotalFils,
    vat_fils: extraction.vatFils,
    total_fils: extraction.totalFils,
    vat_inclusive: extraction.vatInclusive,
    confidence: extraction.confidence,
    lines: extraction.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unit_price_fils: line.unitPriceFils,
      amount_fils: line.amountFils,
      tax_fils: line.taxFils,
      classification: line.classification
    }))
  };
}
