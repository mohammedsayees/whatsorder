import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("size groups and bulk photos contracts", () => {
  const sizeGroups = read("src/lib/menu-size-groups.ts");
  const demo = read("src/app/try/actions.ts");
  const importer = read("src/app/admin/menu/import/actions.ts");
  const bulk = read("src/components/admin/BulkAiPhotos.tsx");

  it("scopes every size-group read and write to the restaurant", () => {
    const tableCalls = sizeGroups.match(/\.from\("menu_(option_groups|options|item_option_groups)"\)/g) ?? [];
    expect(tableCalls.length).toBeGreaterThanOrEqual(5);
    expect(sizeGroups.match(/restaurant_id: restaurantId/g)?.length).toBeGreaterThanOrEqual(3);
    expect(sizeGroups.match(/\.eq\("restaurant_id", restaurantId\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("creates required single-choice Size groups", () => {
    expect(sizeGroups).toContain("min_select: 1");
    expect(sizeGroups).toContain("max_select: 1");
  });

  it("groups sizes in both the demo build and the admin importer", () => {
    expect(demo).toContain("groupSizeVariants(dedupeDraftItems(");
    expect(demo).toContain("attachSizeOptionGroups(");
    expect(importer).toContain("groupSizeVariants(");
    expect(importer).toContain("attachSizeOptionGroups(supabase, session.restaurantId");
  });

  it("bulk photos reuse the guarded single-item actions", () => {
    expect(bulk).toContain("generateMenuItemImageAction(");
    expect(bulk).toContain("confirmGeneratedMenuItemImageAction(");
    expect(bulk).not.toContain("getSupabaseAdmin");
  });
});
