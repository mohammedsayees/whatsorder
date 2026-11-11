import { describe, expect, it } from "vitest";
import { isAdminPosPathname } from "./admin-shell";

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
