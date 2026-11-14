import { describe, expect, it } from "vitest";

import { buildMarketingCaption, MARKETING_OPT_OUT_LINE, MARKETING_OPT_OUT_LINE_AR } from "./caption";
import {
  CAPTION_MAX,
  HEADLINE_MAX,
  SUBLINE_MAX,
  copyAmountsGrounded,
  fallbackCopyVariants,
  normalizeDigits,
  repeatsSalesFigure,
  type PosterCopyFacts
} from "./copy";
import { FESTIVALS, festivalsForCountry } from "./festivals";
import { posterLanguageAllowed } from "./language";
import { isMarketingOptOutKeyword } from "../marketing/opt-out";
import { POSTER_TEMPLATE_IDS } from "./types";

const facts: PosterCopyFacts = {
  templateId: "offer",
  restaurantName: "Chai Xpress",
  itemName: "Karak",
  priceLines: ["AED 12"],
  soldQty: 87,
  market: "the UAE"
};

describe("Arabic copy guard", () => {
  it("normalises Arabic-Indic digits and separators", () => {
    expect(normalizeDigits("١٢٫٥ درهم ۷۸")).toBe("12.5 درهم 78");
  });

  it("rejects an Arabic caption that invents a price, in either digit form", () => {
    const copy = (caption: string) => ({ headline: "عرض", subline: "عرض", caption });
    expect(copyAmountsGrounded(copy("الحين بـ ١٢ درهم"), facts)).toBe(true);
    expect(copyAmountsGrounded(copy("الحين بـ 12 درهم"), facts)).toBe(true);
    expect(copyAmountsGrounded(copy("الحين بـ ٩ درهم"), facts)).toBe(false);
    expect(copyAmountsGrounded(copy("بسعر د.إ ٥"), facts)).toBe(false);
  });

  it("catches the sold count written in Arabic-Indic digits", () => {
    expect(repeatsSalesFigure({ headline: "أكثر من ٨٧ كوب", subline: "", caption: "" }, facts)).toBe(true);
  });

  it("allows the loyalty stamp count", () => {
    const loyalty = { ...facts, templateId: "loyalty" as const, priceLines: [], loyaltyStamps: 10 };
    expect(copyAmountsGrounded({ headline: "Collect 10 stamps", subline: "", caption: "١٠ أختام" }, loyalty)).toBe(true);
  });
});

describe("fallback copy", () => {
  it("exists for every template in English and Arabic, within the caps and number-free", () => {
    for (const templateId of POSTER_TEMPLATE_IDS) {
      for (const language of ["en", "ar"] as const) {
        const variants = fallbackCopyVariants({
          ...facts,
          templateId,
          language,
          soldQty: null,
          occasion: "Eid",
          loyaltyReward: "a free karak",
          loyaltyStamps: 10
        });
        expect(variants, `${templateId} ${language}`).toHaveLength(3);
        for (const copy of variants) {
          expect(copy.headline.length).toBeLessThanOrEqual(HEADLINE_MAX);
          expect(copy.subline.length).toBeLessThanOrEqual(SUBLINE_MAX);
          expect(copy.caption.length).toBeLessThanOrEqual(CAPTION_MAX);
          expect(normalizeDigits(`${copy.headline} ${copy.subline} ${copy.caption}`)).not.toMatch(/\d/);
          if (language === "ar") {
            expect(copy.headline).toMatch(/[؀-ۿ]/);
          }
        }
      }
    }
  });
});

describe("festivals", () => {
  it("offers occasions by country", () => {
    expect(festivalsForCountry("AE").map((f) => f.id)).toEqual([
      "ramadan",
      "eid_al_fitr",
      "eid_al_adha",
      "uae_national_day"
    ]);
    expect(festivalsForCountry("IN").map((f) => f.id)).toContain("diwali");
    expect(festivalsForCountry("IN").map((f) => f.id)).not.toContain("uae_national_day");
  });

  it("has a code-owned greeting for every occasion", () => {
    for (const festival of Object.values(FESTIVALS)) {
      expect(festival.greeting.length).toBeGreaterThan(3);
    }
  });
});

describe("Arabic posters", () => {
  it("are offered to UAE restaurants or ones with Arabic details", () => {
    expect(posterLanguageAllowed({ country_code: "AE", name_ar: null, subtitle_ar: null, address_ar: null })).toBe(true);
    expect(posterLanguageAllowed({ country_code: "IN", name_ar: null, subtitle_ar: null, address_ar: null })).toBe(false);
    expect(posterLanguageAllowed({ country_code: "IN", name_ar: "مطعم", subtitle_ar: null, address_ar: null })).toBe(true);
  });

  it("send captions carry the Arabic opt-out line once, and it works as a STOP reply", () => {
    const caption = buildMarketingCaption("عرض خاص", "https://x/r/y?src=poster-z", "ar");
    expect(caption.endsWith(MARKETING_OPT_OUT_LINE_AR)).toBe(true);
    expect(caption).not.toContain(MARKETING_OPT_OUT_LINE);
    expect(buildMarketingCaption(caption, "https://x/r/y?src=poster-z", "ar")).toBe(caption);
    const keyword = MARKETING_OPT_OUT_LINE_AR.match(/«(.+)»/)?.[0];
    expect(isMarketingOptOutKeyword(keyword)).toBe(true);
  });
});
