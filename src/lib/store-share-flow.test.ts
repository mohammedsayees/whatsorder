import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("store sharing onboarding flow", () => {
  const shareAction = source("src/app/admin/share/actions.ts");
  const sharePage = source("src/app/admin/share/page.tsx");
  const shareKit = source("src/components/admin/StoreShareKit.tsx");
  const printPage = source("src/app/admin/menu/print/page.tsx");
  const progressCard = source("src/components/admin/OnboardingProgressCard.tsx");
  const ordersPage = source("src/app/admin/orders/page.tsx");

  it("routes onboarding to the focused share screen instead of the printable menu", () => {
    expect(progressCard).toContain('href: "/admin/share"');
    expect(ordersPage).toContain('href="/admin/share"');
    expect(sharePage).toContain("getStoreShareAssets");
    expect(shareKit).toContain("Share your store");
  });

  it("offers link, QR, WhatsApp and print actions without requiring menu items", () => {
    for (const label of [
      "Copy link",
      "Download QR image",
      "Share on WhatsApp",
      "Print QR counter card",
      "Open customer store"
    ]) {
      expect(shareKit).toContain(label);
    }
    expect(sharePage).not.toContain("getMenu");
  });

  it("completes onboarding only after a meaningful tenant-authorized action", () => {
    expect(shareAction).toContain(
      'requireRestaurantRole([\n    "owner",\n    "restaurant_admin",\n    "manager"'
    );
    expect(shareAction).toContain(
      "session.restaurantId !== expectedRestaurantId"
    );
    expect(shareAction).toContain(
      'markOnboardingTasksComplete(session.restaurantId, ["qr_generated"])'
    );
    expect(printPage).not.toContain("markOnboardingTasksComplete");
    expect(printPage).not.toContain("recordOnboardingEvent");
  });

  it("keeps the printable menu as an optional secondary tool", () => {
    expect(shareKit).toContain('href="/admin/menu/print"');
    expect(shareKit).toContain("Create printable menu");
  });
});
