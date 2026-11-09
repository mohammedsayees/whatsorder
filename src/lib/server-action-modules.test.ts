import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("server action module contracts", () => {
  it("does not re-export erased imports from the new-order alert action module", () => {
    const source = readFileSync(
      new URL("../app/admin/alerts/actions.ts", import.meta.url),
      "utf8"
    );

    expect(source).not.toMatch(/export\s+type\s+\{/);
  });

  it("keeps public checkout mutations out of the shared admin action module", () => {
    const checkoutForm = readFileSync(
      new URL("../components/customer/CheckoutForm.tsx", import.meta.url),
      "utf8"
    );
    const sharedActions = readFileSync(
      new URL("../app/actions.ts", import.meta.url),
      "utf8"
    );
    const checkoutActions = readFileSync(
      new URL("../app/r/[restaurantSlug]/checkout/actions.ts", import.meta.url),
      "utf8"
    );

    expect(checkoutForm).toContain(
      'from "@/app/r/[restaurantSlug]/checkout/actions"'
    );
    expect(sharedActions).not.toContain("createOrderAction");
    expect(checkoutActions).toContain("export async function createOrderAction");
  });
});
