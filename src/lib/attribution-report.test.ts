import { describe, expect, it } from "vitest";

import {
  UNTAGGED_SOURCE,
  summarizeAttribution,
  summarizeSignupSources
} from "./attribution-report";

describe("summarizeAttribution", () => {
  it("groups posters, labels share sources and sorts untagged last", () => {
    const rows = summarizeAttribution([
      null,
      null,
      null,
      "share-qr",
      "share-qr",
      "poster-a",
      "poster-b",
      "share-link",
      "field-karama"
    ]);
    expect(rows.map((row) => [row.bucket, row.count])).toEqual([
      ["posters", 2],
      ["share-qr", 2],
      ["field-karama", 1],
      ["share-link", 1],
      [UNTAGGED_SOURCE, 3]
    ]);
    expect(rows.find((row) => row.bucket === "share-qr")?.label).toBe(
      "QR code (download / counter card)"
    );
    expect(rows.find((row) => row.bucket === "field-karama")?.label).toBe("field-karama");
  });

  it("returns nothing for no orders", () => {
    expect(summarizeAttribution([])).toEqual([]);
  });
});

describe("summarizeSignupSources", () => {
  it("counts demos and claims per source", () => {
    const rows = summarizeSignupSources([
      { signup_source: "home", is_demo: true },
      { signup_source: "home", is_demo: false },
      { signup_source: "home", is_demo: true },
      { signup_source: "ref-chaixpress", is_demo: false }
    ]);
    expect(rows).toEqual([
      { bucket: "home", label: "WhatsOrder homepage", demos: 3, claimed: 1 },
      { bucket: "ref-chaixpress", label: "ref-chaixpress", demos: 1, claimed: 1 }
    ]);
  });
});
