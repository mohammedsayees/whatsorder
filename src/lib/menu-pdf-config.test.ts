import { describe, expect, it } from "vitest";
import { parseMenuPrintPdfSettings } from "@/lib/menu-pdf-config";

describe("parseMenuPrintPdfSettings", () => {
  it("accepts valid design settings and trims client-controlled text", () => {
    const settings = parseMenuPrintPdfSettings({
      paperSize: "a4",
      defaultLayout: "hero",
      categoryLayouts: { drinks: "beverage", bad: "unknown" },
      heroItemIds: { drinks: "juice" },
      themeId: "midnight",
      colourMode: "vibrant",
      imageFit: "cover",
      imageFocus: "top",
      backgroundTreatment: "cutout",
      showDescriptions: true,
      showArabic: true,
      showQrCode: true,
      showLogo: true,
      includeCover: true,
      coverTitle: `  ${"M".repeat(90)}  `,
      coverSubtitle: "Dinner and drinks",
      coverHeroItemId: "juice",
      includeBackCover: true,
      backMessage: "Scan to order"
    });

    expect(settings?.themeId).toBe("midnight");
    expect(settings?.categoryLayouts).toEqual({ drinks: "beverage" });
    expect(settings?.coverTitle).toHaveLength(80);
    expect(settings?.backgroundTreatment).toBe("cutout");
  });

  it("rejects requests without required page and layout settings", () => {
    expect(parseMenuPrintPdfSettings({ themeId: "fresh" })).toBeNull();
  });
});
