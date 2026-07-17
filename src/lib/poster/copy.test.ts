import { describe, expect, it } from "vitest";

import {
  CAPTION_MAX,
  COPY_VARIANT_COUNT,
  HEADLINE_MAX,
  SUBLINE_MAX,
  copyAmountsGrounded,
  fallbackCopyVariants,
  normalizeCopyVariants,
  truncateToCap,
  type PosterCopyFacts
} from "./copy";

const facts: PosterCopyFacts = {
  templateId: "offer",
  restaurantName: "Chai Xpress",
  itemName: "Karak Chai",
  priceLines: ["AED 12", "AED 15"],
  soldQty: 87,
  market: "the UAE"
};

function variant(headline: string, subline = "sub", caption = "cap") {
  return { headline, subline, caption };
}

describe("truncateToCap", () => {
  it("keeps short strings verbatim", () => {
    expect(truncateToCap("Karak Chai", 38)).toBe("Karak Chai");
  });

  it("truncates with an ellipsis inside the cap", () => {
    const result = truncateToCap("x".repeat(50), 38);
    expect(result.length).toBeLessThanOrEqual(38);
    expect(result.endsWith("…")).toBe(true);
  });

  it("collapses whitespace so caps measure real content", () => {
    expect(truncateToCap("a   b\n\nc", 38)).toBe("a b c");
  });
});

describe("copyAmountsGrounded", () => {
  it("accepts amounts present in the facts", () => {
    expect(
      copyAmountsGrounded(
        variant("Karak for AED 12", "was AED 15", "Order for AED 12 now"),
        facts
      )
    ).toBe(true);
  });

  it("rejects invented prices — the LLM never discounts on its own", () => {
    expect(
      copyAmountsGrounded(variant("Now only AED 9!", "sub", "cap"), facts)
    ).toBe(false);
    expect(
      copyAmountsGrounded(variant("h", "just 5 dirhams", "cap"), facts)
    ).toBe(false);
  });

  it("allows the sold quantity but not other bare money-ish figures", () => {
    expect(
      copyAmountsGrounded(variant("87 cups sold", "sub", "cap"), facts)
    ).toBe(true);
  });
});

describe("normalizeCopyVariants", () => {
  it("parses a clean JSON array and enforces caps", () => {
    const raw = JSON.stringify([
      variant("h1".repeat(40), "s1", "c1"),
      variant("h2", "s2".repeat(60), "c2"),
      variant("h3", "s3", "c3".repeat(120))
    ]);
    const result = normalizeCopyVariants(raw, facts);
    expect(result).toHaveLength(COPY_VARIANT_COUNT);
    for (const copy of result) {
      expect(copy.headline.length).toBeLessThanOrEqual(HEADLINE_MAX);
      expect(copy.subline.length).toBeLessThanOrEqual(SUBLINE_MAX);
      expect(copy.caption.length).toBeLessThanOrEqual(CAPTION_MAX);
    }
  });

  it("parses fenced JSON as a fallback", () => {
    const raw =
      "```json\n" +
      JSON.stringify([variant("a"), variant("b"), variant("c")]) +
      "\n```";
    const result = normalizeCopyVariants(raw, facts);
    expect(result[0].headline).toBe("a");
  });

  it("replaces ungrounded variants from the deterministic fallbacks", () => {
    const raw = JSON.stringify([
      variant("Only AED 3 today"),
      variant("b"),
      variant("c")
    ]);
    const result = normalizeCopyVariants(raw, facts);
    expect(result).toHaveLength(COPY_VARIANT_COUNT);
    expect(result.some((copy) => copy.headline.includes("AED 3"))).toBe(false);
  });

  it("returns full fallbacks on garbage", () => {
    expect(normalizeCopyVariants("not json at all", facts)).toEqual(
      fallbackCopyVariants(facts)
    );
  });
});

describe("fallbackCopyVariants", () => {
  it("always yields exactly 3 in-cap variants for both templates", () => {
    for (const templateId of ["bestseller", "offer"] as const) {
      const result = fallbackCopyVariants({ ...facts, templateId });
      expect(result).toHaveLength(COPY_VARIANT_COUNT);
      for (const copy of result) {
        expect(copy.headline.length).toBeLessThanOrEqual(HEADLINE_MAX);
        expect(copy.subline.length).toBeLessThanOrEqual(SUBLINE_MAX);
        expect(copy.caption.length).toBeLessThanOrEqual(CAPTION_MAX);
      }
    }
  });

  it("makes no numeric claims on cold start", () => {
    const result = fallbackCopyVariants({
      ...facts,
      templateId: "bestseller",
      soldQty: null,
      priceLines: []
    });
    for (const copy of result) {
      expect(`${copy.headline} ${copy.subline} ${copy.caption}`).not.toMatch(
        /\d/
      );
    }
  });
});
