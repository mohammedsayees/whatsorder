import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Super Admin AI menu import contracts", () => {
  const actions = read("src/app/admin/menu/import/actions.ts");
  const page = read("src/app/super-admin/(protected)/restaurants/[id]/menu-import/page.tsx");
  const importer = read("src/components/admin/MenuImport.tsx");

  it("checks Super Admin before trusting a client-supplied restaurant id", () => {
    const helper = actions.slice(
      actions.indexOf("async function requireMenuImportSession"),
      actions.indexOf("export type ExtractPageResult")
    );
    expect(helper).toContain("if (actingRestaurantId) {");
    expect(helper.indexOf("await requireSuperAdmin()")).toBeGreaterThan(-1);
    expect(helper.indexOf("await requireSuperAdmin()")).toBeLessThan(helper.indexOf('.from("restaurants")'));
    expect(helper).toContain("UUID_PATTERN.test(actingRestaurantId)");
  });

  it("keeps the owner path on the session's own restaurant", () => {
    expect(actions).toContain('requireRestaurantRole(["restaurant_admin", "owner", "manager"])');
    expect(actions).not.toMatch(/export async function \w+\([^)]*\)[^{]*\{\s*await requireRestaurantRole/);
  });

  it("routes every exported action through the shared guard", () => {
    const exported = actions.match(/export async function \w+/g) ?? [];
    expect(exported.length).toBe(5);
    expect(actions.match(/await requireMenuImportSession\(/g)?.length).toBe(5);
  });

  it("only uses the Super Admin path from the Super Admin page", () => {
    expect(page).toContain("await requireSuperAdmin()");
    expect(page).toContain("actingRestaurantId={restaurant.id}");
    expect(page).toContain("export const maxDuration = 60");
    expect(importer).toContain('formData.set("restaurant_id", actingRestaurantId)');
  });
});
