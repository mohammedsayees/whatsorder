import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const migration = source("supabase/migrations/20261116180000_poster_ai_art.sql").toLowerCase();

describe("poster AI art migration", () => {
  it("tags AI image usage by purpose, keeping existing rows as menu photos", () => {
    expect(migration).toContain("add column if not exists purpose text not null default 'menu_photo'");
    expect(migration).toContain("'menu_photo', 'poster_cutout', 'poster_background'");
  });

  it("caches artwork per restaurant, item and kind; read-only for members", () => {
    expect(migration).toContain("unique (restaurant_id, menu_item_id, kind)");
    expect(migration).toContain("alter table public.poster_art enable row level security");
    expect(migration).toContain("public.is_restaurant_member(restaurant_id)");
    expect(migration).not.toMatch(/for (insert|update|delete|all)\s+to\s/);
    expect(migration).toContain("cmd <> 'select'");
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });

  it("keeps the menu editor's own daily cap on menu photos only", () => {
    expect(source("src/app/admin/menu/ai-image/actions.ts")).toContain('.eq("purpose", "menu_photo")');
  });
});
