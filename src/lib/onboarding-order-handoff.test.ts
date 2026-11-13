import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { onboardingOrdersHref } from "./onboarding-order-handoff";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("onboarding test-order handoff", () => {
  const checkoutAction = source("src/app/r/[restaurantSlug]/checkout/actions.ts");
  const checkoutPage = source("src/app/r/[restaurantSlug]/checkout/page.tsx");
  const checkoutForm = source("src/components/customer/CheckoutForm.tsx");
  const confirmation = source("src/components/customer/SavedOrderConfirmation.tsx");
  const thankYouPage = source("src/app/r/[restaurantSlug]/thank-you/page.tsx");
  const ordersPage = source("src/app/admin/orders/page.tsx");

  it("links to the exact new order in the active New-order queue", () => {
    expect(
      onboardingOrdersHref("123e4567-e89b-12d3-a456-426614174000")
    ).toBe(
      "/admin/orders?status=new&sort=oldest&q=123e4567-e89b-12d3-a456-426614174000&onboarding=test-order&highlight=123e4567-e89b-12d3-a456-426614174000#order-123e4567-e89b-12d3-a456-426614174000"
    );
  });

  it("server-verifies that test mode belongs to a non-staff admin of the restaurant", () => {
    for (const checkedSource of [checkoutAction, checkoutPage, thankYouPage]) {
      expect(checkedSource).toContain("getRestaurantAdminSession");
      expect(checkedSource).toContain(
        'onboardingSession?.restaurantId === restaurant.id'
      );
      expect(checkedSource).toContain('onboardingSession.role !== "staff"');
    }
  });

  it("preserves verified test mode through both confirmation paths", () => {
    expect(checkoutForm).toContain('name="onboarding_test"');
    expect(checkoutForm).toContain('"&onboarding=test-order"');
    expect(checkoutForm).toContain(
      "onboardingTest: result.onboardingTest"
    );
    expect(checkoutForm).toContain(
      "Go to dashboard and accept order"
    );
    expect(confirmation).toContain(
      "Go to dashboard and accept order"
    );
  });

  it("highlights the order and guides the owner to QR after acceptance", () => {
    expect(ordersPage).toContain(
      "Your test order is highlighted below"
    );
    expect(ordersPage).toContain(
      "Test order accepted — your store is ready"
    );
    expect(ordersPage).toContain('href="/admin/share"');
  });
});
