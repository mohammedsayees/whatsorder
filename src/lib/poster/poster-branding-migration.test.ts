import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { POSTER_THEME_IDS } from "./themes";

const migration = readFileSync(
  new URL("../../../supabase/migrations/20261116160000_poster_branding.sql", import.meta.url),
  "utf8"
).toLowerCase();

describe("poster branding migration", () => {
  it("adds nullable, validated columns only", () => {
    expect(migration).toContain("add column if not exists poster_brand_color text");
    expect(migration).toContain("add column if not exists poster_theme text");
    expect(migration).toContain("'^#[0-9a-f]{6}$'");
    expect(migration).not.toContain("create policy");
  });

  it("allows exactly the themes the code knows", () => {
    for (const id of POSTER_THEME_IDS) {
      expect(migration).toContain(`'${id}'`);
    }
  });

  it("self-verifies the restaurants RLS posture", () => {
    expect(migration).toContain("cmd in ('insert', 'update', 'delete', 'all')");
    expect(migration).toContain("raise exception");
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });
});
