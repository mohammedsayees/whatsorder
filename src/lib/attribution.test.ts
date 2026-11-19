import { describe, expect, it } from "vitest";

import {
  STORE_SHARE_SOURCES,
  posterAttributionSource,
  sanitizeAttributionSource,
  withAttributionSource
} from "./attribution";

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

describe("withAttributionSource", () => {
  it("adds src to a clean store link", () => {
    expect(withAttributionSource("https://x.app/r/chaixpress", "share-qr")).toBe(
      "https://x.app/r/chaixpress?src=share-qr"
    );
  });

  it("replaces an existing src and keeps other params", () => {
    expect(withAttributionSource("https://x.app/r/c?table=4&src=old", "share-link")).toBe(
      "https://x.app/r/c?table=4&src=share-link"
    );
  });

  it("leaves the url alone for an invalid source", () => {
    expect(withAttributionSource("https://x.app/r/c", "bad source")).toBe("https://x.app/r/c");
  });

  it("uses only valid tokens for the share kit", () => {
    for (const source of Object.values(STORE_SHARE_SOURCES)) {
      expect(sanitizeAttributionSource(source)).toBe(source);
    }
  });
});
