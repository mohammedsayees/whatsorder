import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("restaurant operational reliability boundaries", () => {
  it("prints independently of audit telemetry persistence", () => {
    const printActions = source("src/components/admin/OrderPrintActions.tsx");
    const printFunction = printActions.slice(printActions.indexOf("function print("));
    const printSchedule = printFunction.indexOf("window.setTimeout(() =>");
    const trackingCall = printFunction.indexOf("void recordOrderPrintEventsAction(");

    expect(printSchedule).toBeGreaterThan(-1);
    expect(trackingCall).toBeGreaterThan(printSchedule);
    expect(printActions).toContain(
      'setPrintError("The print opened, but tracking could not be saved.")'
    );
  });

  it("keeps browser storage failures from crashing cart hydration and writes", () => {
    const cartProvider = source("src/components/customer/CartProvider.tsx");

    expect(cartProvider).toContain("parseAndValidateCart(saved)");
    expect(cartProvider).toContain("window.localStorage.removeItem(storageKey)");
    expect(cartProvider).toContain("setIsReady(true)");
    expect(cartProvider).toContain('window.addEventListener("storage", handleStorage)');
  });

  it("serializes only the public feedback DTO", () => {
    const feedback = source("src/lib/feedback.ts");
    const types = source("src/lib/types.ts");

    expect(feedback).toContain(
      '.select("id,rating,comment,customer_display_name")'
    );
    expect(types).toContain("export type PublicCustomerFeedback = Pick<");
    expect(types).toContain("reviews: PublicCustomerFeedback[]");
  });

  it("polls for new orders within the 15-second fallback window", () => {
    const alerts = source("src/components/admin/NewOrderAlerts.tsx");
    const refreshEffect = alerts.slice(
      alerts.indexOf("const initialRefreshTimer"),
      alerts.indexOf("const handleFocus")
    );

    expect(refreshEffect).toContain("}, 15_000)");
    expect(refreshEffect).not.toContain("}, 30_000)");
  });

  it("requires confirmation before destructive menu actions", () => {
    const menu = source("src/components/admin/MenuManager.tsx");
    const offers = source("src/components/admin/OffersManager.tsx");
    const options = source("src/components/admin/OptionGroupsManager.tsx");

    expect(menu).toContain("window.confirm");
    expect(offers).toContain("window.confirm");
    expect(options).toContain("window.confirm(`Delete");
  });

  it("revokes authenticated sessions before clearing logout cookies", () => {
    const restaurantLogin = source("src/app/admin-login/actions.ts");
    const superAdmin = source("src/app/super-admin/actions.ts");

    const logoutStart = restaurantLogin.indexOf("logoutRestaurantAdminAction");
    expect(restaurantLogin.indexOf("await revokeCurrentAuthSession()", logoutStart)).toBeLessThan(
      restaurantLogin.indexOf("await clearAuthCookies()", logoutStart)
    );
    expect(superAdmin).toContain("await revokeCurrentAuthSession()");
  });

  it("does not create public storage buckets from request-time actions", () => {
    expect(source("src/app/actions.ts")).not.toContain("storage.createBucket");
    expect(source("src/app/admin/menu/ai-image/actions.ts")).not.toContain(
      "storage.createBucket"
    );
  });

  it("sets baseline browser security headers", () => {
    const config = source("next.config.ts");

    expect(config).toContain("Content-Security-Policy");
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain("X-Content-Type-Options");
    expect(config).toContain("Permissions-Policy");
    expect(config).not.toContain('hostname: "**.supabase.co"');
  });

  it("fails closed when production order throttling is unavailable", () => {
    const actions = source("src/app/actions.ts");
    const limiter = actions.slice(
      actions.indexOf("async function checkOrderRateLimit"),
      actions.indexOf("export async function createOrderAction")
    );

    expect(limiter).toContain('process.env.NODE_ENV === "production" ? "unavailable"');
    expect(actions).toContain('if (rateLimit === "unavailable")');
    expect(actions).not.toContain("rate-limit check failed open");
  });

  it("requires 12-character passwords on both invite setup boundaries", () => {
    expect(source("src/app/auth/invite/actions.ts")).toContain("password.length < 12");
    expect(source("src/app/auth/setup-password/page.tsx").match(/minLength=\{12\}/g)).toHaveLength(2);
  });

  it("blocks shift closure at both the UI and transactional RPC boundaries", () => {
    const migration = source(
      "supabase/migrations/20260714120000_prevent_shift_close_with_active_orders.sql"
    );
    const shiftData = source("src/lib/shift-data.ts");
    const shiftForm = source("src/components/admin/ShiftForms.tsx");

    expect(migration).toContain("Cannot close shift while active orders remain");
    expect(migration).toContain("restaurant_id = target_restaurant_id");
    expect(migration).toContain("'Ready to Serve'");
    expect(migration).toContain("'Out for Delivery'");
    expect(shiftData).toContain('.in("status", [...activeOrderStatuses])');
    expect(shiftForm).toContain("activeOrderCount > 0");
  });
});
