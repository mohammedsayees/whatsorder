import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("server action module contracts", () => {
  it("does not re-export erased imports from the new-order alert action module", () => {
    const source = readFileSync(
      new URL("../app/admin/alerts/actions.ts", import.meta.url),
      "utf8"
    );

    expect(source).not.toMatch(/export\s+type\s+\{/);
  });
});
