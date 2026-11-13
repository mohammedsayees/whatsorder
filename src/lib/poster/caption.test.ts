import { describe, expect, it } from "vitest";

import {
  buildMarketingCaption,
  buildPosterCaption,
  MARKETING_OPT_OUT_LINE,
  posterStoreLink,
  WHATSAPP_CAPTION_MAX
} from "./caption";

const POSTER_ID = "6f1c2a4e-1b2c-4d5e-8f90-0a1b2c3d4e5f";
const LINK = posterStoreLink("https://app.test/", "chaixpress", POSTER_ID);

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("posterStoreLink", () => {
  it("builds the tracked store link", () => {
    expect(LINK).toBe(`https://app.test/r/chaixpress?src=poster-${POSTER_ID}`);
  });
});

describe("buildMarketingCaption", () => {
  it("is AI text, then the store link, then the opt-out line — each once", () => {
    const caption = buildMarketingCaption("Karak chai, our bestseller ☕", LINK);
    expect(caption).toBe(
      `Karak chai, our bestseller ☕\n\n${LINK}\n\n${MARKETING_OPT_OUT_LINE}`
    );
    expect(occurrences(caption, MARKETING_OPT_OUT_LINE)).toBe(1);
    expect(occurrences(caption, LINK)).toBe(1);
  });

  it("is idempotent — never adds a second link or opt-out line", () => {
    const once = buildMarketingCaption("Try it today", LINK);
    expect(buildMarketingCaption(once, LINK)).toBe(once);
    expect(
      occurrences(
        buildMarketingCaption(`${MARKETING_OPT_OUT_LINE} Try it ${MARKETING_OPT_OUT_LINE}`),
        MARKETING_OPT_OUT_LINE
      )
    ).toBe(1);
  });

  it("still carries the link and opt-out line when the AI caption is empty", () => {
    expect(buildMarketingCaption("", LINK)).toBe(`${LINK}\n\n${MARKETING_OPT_OUT_LINE}`);
    expect(buildMarketingCaption(null)).toBe(MARKETING_OPT_OUT_LINE);
  });

  it("trims the AI text, never the link or opt-out line, to fit WhatsApp's limit", () => {
    const caption = buildMarketingCaption("x".repeat(5000), LINK);
    expect(caption.length).toBeLessThanOrEqual(WHATSAPP_CAPTION_MAX);
    expect(caption.endsWith(`${LINK}\n\n${MARKETING_OPT_OUT_LINE}`)).toBe(true);
  });

  it("fits comfortably with a full-length AI caption (160 chars)", () => {
    const caption = buildMarketingCaption("y".repeat(160), LINK);
    expect(caption.startsWith("y".repeat(160))).toBe(true);
    expect(caption.length).toBeLessThan(WHATSAPP_CAPTION_MAX);
  });
});

describe("buildPosterCaption (copy / share)", () => {
  it("adds the link but no opt-out line", () => {
    expect(buildPosterCaption("Fresh today", { storeLink: LINK })).toBe(
      `Fresh today\n\n${LINK}`
    );
  });
});
