import { describe, expect, it } from "vitest";

import { posterAttributionSource, sanitizeAttributionSource } from "./attribution";

describe("sanitizeAttributionSource", () => {
  it.each([
    ["poster-6f1c2a4e-1b2c-4d5e-8f90-0a1b2c3d4e5f", "poster-6f1c2a4e-1b2c-4d5e-8f90-0a1b2c3d4e5f"],
    ["  Poster-ABC  ", "poster-abc"],
    ["qr_table", "qr_table"]
  ])("accepts %j", (input, expected) => {
    expect(sanitizeAttributionSource(input)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    42,
    "",
    "-poster",
    "poster x",
    "poster<script>",
    "a".repeat(65),
    "posters/../../x"
  ])("rejects %j", (input) => {
    expect(sanitizeAttributionSource(input)).toBeNull();
  });
});

describe("posterAttributionSource", () => {
  it("is a valid source token", () => {
    const source = posterAttributionSource("6F1C2A4E-1B2C-4D5E-8F90-0A1B2C3D4E5F");
    expect(source).toBe("poster-6f1c2a4e-1b2c-4d5e-8f90-0a1b2c3d4e5f");
    expect(sanitizeAttributionSource(source)).toBe(source);
  });
});
