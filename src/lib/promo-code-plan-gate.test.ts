import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tenantHasFeature } from "@/lib/billing";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

// Promo codes are managed under Marketing, which is a Growth-plan feature
// ("campaigns"). Customers can always redeem codes that were already shared.
describe("promo code plan gate", () => {
  const page = read("src/app/admin/marketing/promo-codes/page.tsx");
  const actions = read("src/app/admin/marketing/promo-codes/actions.ts");

  it("sends owners on plans without Marketing to the upgrade page", () => {
    expect(page).toContain('await requirePlanFeature(restaurant.id, "campaigns");');
    expect(page.indexOf("requirePlanFeature(")).toBeLessThan(page.indexOf("listPromoCodes("));
  });

  it("refuses every promo code write without the plan feature", () => {
    const context = actions.slice(
      actions.indexOf("async function promoContext"),
      actions.indexOf("export async function createPromoCodeAction")
    );
    expect(context).toContain('if (!tenantHasFeature(access, "campaigns")) {');
    expect(context).toContain('planUpgradeMessage("campaigns")');
    for (const action of ["createPromoCodeAction", "setPromoCodeActiveAction", "deletePromoCodeAction"]) {
      const body = actions.slice(actions.indexOf(`export async function ${action}`));
      expect(body.slice(0, body.indexOf("supabase"))).toContain("await promoContext()");
    }
  });

  it("never gates redeeming a code at the customer checkout", () => {
    for (const path of [
      "src/app/r/[restaurantSlug]/checkout/actions.ts",
      "src/lib/promo-code-data.ts",
      "src/components/customer/PromoCodeField.tsx"
    ]) {
      const source = read(path);
      expect(source).not.toMatch(/plan-gates|tenantHasFeature|planAllows|requirePlanFeature/);
    }
  });

  it("treats the campaigns flag as the Marketing entitlement", () => {
    const base = { plan_code: "starter", plan_features: { campaigns: false } } as never;
    expect(tenantHasFeature(base, "campaigns")).toBe(false);
    expect(tenantHasFeature({ plan_code: "growth", plan_features: { campaigns: true } } as never, "campaigns")).toBe(true);
  });
});
