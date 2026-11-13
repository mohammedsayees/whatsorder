import { describe, expect, it } from "vitest";

import {
  buildMarketingCaption,
  MARKETING_OPT_OUT_LINE,
  WHATSAPP_CAPTION_MAX
} from "./caption";

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("buildMarketingCaption", () => {
  it("appends the opt-out line once, at the end", () => {
    const caption = buildMarketingCaption("Karak chai, our bestseller. Order on WhatsApp ☕");
    expect(caption).toBe(
      `Karak chai, our bestseller. Order on WhatsApp ☕\n\n${MARKETING_OPT_OUT_LINE}`
    );
    expect(occurrences(caption, MARKETING_OPT_OUT_LINE)).toBe(1);
  });

  it("is idempotent — never adds a second line", () => {
    const once = buildMarketingCaption("Try it today");
    expect(buildMarketingCaption(once)).toBe(once);
    expect(
      occurrences(
        buildMarketingCaption(`${MARKETING_OPT_OUT_LINE} Try it ${MARKETING_OPT_OUT_LINE}`),
        MARKETING_OPT_OUT_LINE
      )
    ).toBe(1);
  });

  it("still carries the line when the AI caption is empty", () => {
    expect(buildMarketingCaption("")).toBe(MARKETING_OPT_OUT_LINE);
    expect(buildMarketingCaption(null)).toBe(MARKETING_OPT_OUT_LINE);
  });

  it("trims the AI text, never the opt-out line, to fit WhatsApp's limit", () => {
    const caption = buildMarketingCaption("x".repeat(5000));
    expect(caption.length).toBeLessThanOrEqual(WHATSAPP_CAPTION_MAX);
    expect(caption.endsWith(MARKETING_OPT_OUT_LINE)).toBe(true);
    expect(occurrences(caption, MARKETING_OPT_OUT_LINE)).toBe(1);
  });
});
