import { describe, expect, it } from "vitest";
import { isAdminPosPathname, isGuidedAdminSetup } from "./admin-shell";

describe("admin shell route mode", () => {
  it.each([
    "/admin/orders/new",
    "/admin/orders/00000000-0000-4000-8000-000000000001/add-items"
  ])("uses POS mode for %s", (pathname) => {
    expect(isAdminPosPathname(pathname)).toBe(true);
  });

  it.each([
    "/admin",
    "/admin/orders",
    "/admin/orders/00000000-0000-4000-8000-000000000001"
  ])("keeps dashboard navigation for %s", (pathname) => {
    expect(isAdminPosPathname(pathname)).toBe(false);
  });
});

describe("guided admin setup", () => {
  const newRestaurant = {
    activated_at: null,
    owner_email_verification_due_at: "2026-11-20T00:00:00Z",
    jobs_only: false
  };

  it("uses focused navigation for a newly claimed owner", () => {
    expect(isGuidedAdminSetup(newRestaurant, "restaurant_admin")).toBe(true);
  });

  it("restores all tools after activation and never narrows staff navigation", () => {
    expect(
      isGuidedAdminSetup(
        { ...newRestaurant, activated_at: "2026-11-13T00:00:00Z" },
        "restaurant_admin"
      )
    ).toBe(false);
    expect(isGuidedAdminSetup(newRestaurant, "staff")).toBe(false);
  });
});
