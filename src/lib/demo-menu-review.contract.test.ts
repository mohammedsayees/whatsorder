import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const demoAction = readFileSync(resolve(process.cwd(), "src/app/try/actions.ts"), "utf8");
const saveAction = demoAction.slice(demoAction.indexOf("export async function saveDemoMenuReviewAction"));

describe("demo menu review contracts", () => {
  it("authorises edits with the private claim proof and validates input", () => {
    expect(saveAction).toContain("await getClaimableDemo()");
    expect(saveAction).toContain("validateDemoMenuReview(input)");
  });

  it("scopes every write to the demo's own restaurant", () => {
    const writes = saveAction.match(/\.(update|delete)\(/g) ?? [];
    const scoped = saveAction.match(/\.eq\("restaurant_id", demo\.id\)/g) ?? [];
    expect(writes.length).toBe(3);
    expect(scoped.length).toBeGreaterThanOrEqual(writes.length + 1);
  });

  it("sends the claim cookie to /try so the review step can use it", () => {
    expect(demoAction).toContain('path: "/try",');
  });

  it("reads pages with bounded concurrency and a total size cap", () => {
    expect(demoAction).toContain("mapWithConcurrency(pages, DEMO_EXTRACTION_CONCURRENCY");
    expect(demoAction).toContain("totalBase64 > DEMO_MAX_TOTAL_BASE64");
  });
});
