import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261111140000_smart_finance_bill_scanning.sql"),
  "utf8"
).toLowerCase();
const extractionWorker = readFileSync(
  resolve(process.cwd(), "src/lib/finance-extraction.ts"),
  "utf8"
).toLowerCase();

describe("smart finance bill scanning migration", () => {
  it("uses private bounded storage", () => {
    expect(migration).toContain("'finance-documents', 'finance-documents', false");
    expect(migration).toContain("10 * 1024 * 1024");
    expect(migration).toContain("page_count between 1 and 10");
  });

  it("keeps scanner writes service-role-only", () => {
    expect(migration).not.toMatch(/for\s+(insert|update|delete|all)\s+to\s+authenticated/);
    expect(migration).toContain("grant all on public.finance_documents");
    expect(migration).toContain("finance scanner write policy detected");
  });

  it("uses tenant-consistent document and expense foreign keys", () => {
    expect(migration).toContain("foreign key (document_id, restaurant_id)");
    expect(migration).toContain("foreign key (source_document_id, restaurant_id)");
    expect(migration).toContain("foreign key (expense_id, restaurant_id)");
  });

  it("claims jobs with bounded attempts and lease tokens", () => {
    expect(migration).toContain("attempts between 0 and 3");
    expect(migration).toContain("requested_lease_token");
    expect(migration).toContain("job.attempts < 3");
  });

  it("approves reviewed documents idempotently in one transaction", () => {
    expect(migration).toContain("create or replace function public.approve_finance_document");
    expect(migration).toContain("if existing_expense_id is not null then return existing_expense_id");
    expect(migration).toContain("duplicate document has already been posted");
  });

  it("does not let the AI extraction worker post expenses", () => {
    expect(extractionWorker).not.toContain('from("finance_expenses")');
    expect(extractionWorker).not.toContain("approve_finance_document");
    expect(extractionWorker).toContain("complete_finance_extraction_job");
  });
});
