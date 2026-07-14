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

  it("polls for new orders within the 15-second fallback window when realtime is down", () => {
    const alerts = source("src/components/admin/NewOrderAlerts.tsx");

    expect(alerts).toContain("const reconcileIntervalFallbackMs = 15_000");
    const refreshEffect = alerts.slice(
      alerts.indexOf("const initialRefreshTimer"),
      alerts.indexOf("const handleWake")
    );
    expect(refreshEffect).toContain(
      'connectionState === "live" ? reconcileIntervalLiveMs : reconcileIntervalFallbackMs'
    );
  });

  it("stops alert reconciliation from polling aggressively while realtime is live", () => {
    const alerts = source("src/components/admin/NewOrderAlerts.tsx");

    expect(alerts).toContain("const reconcileIntervalLiveMs = 5 * 60 * 1_000");
    // Hidden tabs must not reconcile; the wake handler catches up on focus.
    expect(alerts).toContain('if (document.visibilityState === "hidden")');
    expect(alerts).toContain(
      'document.addEventListener("visibilitychange", handleWake)'
    );
    // The repeat-alert nag loop may only call the server while orders are pending.
    expect(alerts).toContain(
      "if (!repeatEnabled || !soundEnabled || newOrderCount === 0)"
    );
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

  it("adds items through a tenant-scoped, idempotent online staff workflow", () => {
    const action = source("src/app/admin/orders/actions.ts");
    const entry = source("src/components/admin/StaffOrderEntry.tsx");
    const list = source("src/components/admin/OrderList.tsx");
    const route = source("src/app/admin/orders/[id]/add-items/page.tsx");

    expect(action).toContain('eq("restaurant_id", session.restaurantId)');
    expect(action).toContain('supabase.rpc("add_items_to_restaurant_order"');
    expect(action).toContain("verifyCombinedOfferLimits");
    expect(entry).toContain("additionAttemptIdRef.current ?? crypto.randomUUID()");
    expect(entry).toContain("Retry this unchanged ticket when online");
    expect(entry).not.toContain("enqueue(addItemsToOrderAction");
    expect(list).toContain("Add items");
    expect(route).toContain("getOrderForAdmin(session.restaurantId, id)");
  });
});
