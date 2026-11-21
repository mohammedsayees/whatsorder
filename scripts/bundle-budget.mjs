// Customer bundle budget. Run after `next build`:  npm run check:bundle
//
// The public customer path (/r/[restaurantSlug]/...) is WhatsOrder's
// load-bearing performance constraint (see CLAUDE.md). This fails CI when a
// customer page's first-load JavaScript grows past its budget, so admin/AI
// weight can't slip into it unnoticed.
//
// "First-load JS" is measured the way `next build` reports it: the gzipped
// size of every .js chunk the page needs on first load (framework/root
// chunks + root layout + nested layouts + the page), counted once each.
// Measured against `next build`'s own table, it agrees to within 1 kB.
//
// To raise a budget, change it here in the same PR as the code that needs
// it, and say why in the PR description.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

// kB = 1,000 bytes gzipped, as `next build` prints. Measured 2026-11-21:
// menu 132.7, checkout 133.6, account 130.3, thank-you 119.5, stamp 114.8.
// Budgets leave ~2-3 kB of headroom.
export const CUSTOMER_BUDGETS_KB = {
  "/r/[restaurantSlug]/page": 135,
  "/r/[restaurantSlug]/checkout/page": 136,
  "/r/[restaurantSlug]/account/page": 133,
  "/r/[restaurantSlug]/thank-you/page": 122,
  "/r/[restaurantSlug]/stamp/page": 117
};

/** Layout entries that wrap an app-router page entry, outermost first. */
export function layoutEntriesFor(pageEntry, appPages) {
  const segments = pageEntry.split("/").filter(Boolean).slice(0, -1);
  const entries = ["/layout"];
  let prefix = "";
  for (const segment of segments) {
    prefix += `/${segment}`;
    if (appPages[`${prefix}/layout`]) {
      entries.push(`${prefix}/layout`);
    }
  }
  return entries;
}

/** Unique .js files needed for a page's first load. */
export function firstLoadFiles(pageEntry, { appPages, rootMainFiles = [] }) {
  if (!appPages[pageEntry]) {
    throw new Error(`No build output for ${pageEntry}. Did the route move?`);
  }
  const files = new Set(rootMainFiles);
  for (const entry of [...layoutEntriesFor(pageEntry, appPages), pageEntry]) {
    for (const file of appPages[entry] ?? []) {
      files.add(file);
    }
  }
  return [...files].filter((file) => file.endsWith(".js"));
}

/** Compare every budgeted page; returns one row per page. */
export function checkBudgets({ appPages, rootMainFiles, gzipBytes, budgets = CUSTOMER_BUDGETS_KB }) {
  return Object.entries(budgets).map(([page, budgetKb]) => {
    const files = firstLoadFiles(page, { appPages, rootMainFiles });
    const kb = files.reduce((total, file) => total + gzipBytes(file), 0) / 1000;
    return { page, kb, budgetKb, ok: kb <= budgetKb };
  });
}

export function formatReport(rows) {
  const lines = rows.map(({ page, kb, budgetKb, ok }) =>
    `${ok ? "ok  " : "OVER"}  ${kb.toFixed(1).padStart(6)} / ${String(budgetKb).padStart(3)} kB  ${page}`
  );
  return ["Customer first-load JS (gzipped):", ...lines].join("\n");
}

function main() {
  const nextDir = join(process.cwd(), ".next");
  let appPages;
  let rootMainFiles;
  try {
    appPages = JSON.parse(readFileSync(join(nextDir, "app-build-manifest.json"), "utf8")).pages;
    rootMainFiles = JSON.parse(readFileSync(join(nextDir, "build-manifest.json"), "utf8")).rootMainFiles;
  } catch {
    console.error("No .next build output found. Run `npm run build` first.");
    process.exit(1);
  }

  const rows = checkBudgets({
    appPages,
    rootMainFiles,
    gzipBytes: (file) => gzipSync(readFileSync(join(nextDir, file))).length
  });
  console.log(formatReport(rows));

  const over = rows.filter((row) => !row.ok);
  if (over.length > 0) {
    console.error(
      `\n${over.length} customer page(s) over budget. Keep admin/AI code out of the customer ` +
        "path (dynamic-import heavy libraries), or raise the budget in scripts/bundle-budget.mjs " +
        "with a reason in the PR."
    );
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
