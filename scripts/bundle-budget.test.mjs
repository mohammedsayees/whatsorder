import { describe, expect, it } from "vitest";
import {
  CUSTOMER_BUDGETS_KB,
  checkBudgets,
  firstLoadFiles,
  formatReport,
  layoutEntriesFor
} from "./bundle-budget.mjs";

const appPages = {
  "/layout": ["static/chunks/root-layout.js", "static/css/app.css"],
  "/r/[restaurantSlug]/layout": ["static/chunks/shared.js", "static/chunks/r-layout.js"],
  "/r/[restaurantSlug]/page": ["static/chunks/shared.js", "static/chunks/menu.js"],
  "/r/[restaurantSlug]/checkout/page": ["static/chunks/checkout.js"],
  "/admin/page": ["static/chunks/admin-heavy.js"]
};
const rootMainFiles = ["static/chunks/framework.js", "static/chunks/root-layout.js"];

describe("bundle budget", () => {
  it("walks the root and nested layouts that wrap a page", () => {
    expect(layoutEntriesFor("/r/[restaurantSlug]/checkout/page", appPages)).toEqual([
      "/layout",
      "/r/[restaurantSlug]/layout"
    ]);
  });

  it("counts each JS chunk once and ignores CSS and other routes", () => {
    expect(firstLoadFiles("/r/[restaurantSlug]/page", { appPages, rootMainFiles }).sort()).toEqual(
      [
        "static/chunks/framework.js",
        "static/chunks/menu.js",
        "static/chunks/r-layout.js",
        "static/chunks/root-layout.js",
        "static/chunks/shared.js"
      ].sort()
    );
  });

  it("fails loudly when a budgeted route disappears", () => {
    expect(() => firstLoadFiles("/r/[restaurantSlug]/gone/page", { appPages, rootMainFiles })).toThrow(
      /No build output/
    );
  });

  it("flags only the pages over budget", () => {
    const rows = checkBudgets({
      appPages,
      rootMainFiles,
      gzipBytes: (file) => (file.includes("checkout") ? 60_000 : 10_000),
      budgets: {
        "/r/[restaurantSlug]/page": 50,
        "/r/[restaurantSlug]/checkout/page": 100
      }
    });

    expect(rows).toEqual([
      { page: "/r/[restaurantSlug]/page", kb: 50, budgetKb: 50, ok: true },
      { page: "/r/[restaurantSlug]/checkout/page", kb: 100, budgetKb: 100, ok: true }
    ]);

    const tight = checkBudgets({
      appPages,
      rootMainFiles,
      gzipBytes: () => 10_000,
      budgets: { "/r/[restaurantSlug]/page": 49 }
    });
    expect(tight[0].ok).toBe(false);
    expect(formatReport(tight)).toContain("OVER");
  });

  it("budgets every customer page that ships meaningful JS", () => {
    expect(Object.keys(CUSTOMER_BUDGETS_KB)).toEqual(
      expect.arrayContaining([
        "/r/[restaurantSlug]/page",
        "/r/[restaurantSlug]/checkout/page",
        "/r/[restaurantSlug]/thank-you/page"
      ])
    );
  });
});
