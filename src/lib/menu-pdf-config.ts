import type { CatalogueLayoutChoice } from "@/lib/menu-print";

export type MenuPrintThemeId = "fresh" | "sunset" | "midnight" | "minimal";
export type MenuPrintImageFit = "contain" | "cover";
export type MenuPrintImageFocus = "top" | "center" | "bottom";
export type MenuPrintBackgroundTreatment = "original" | "blend" | "cutout";

export type MenuPrintTheme = {
  id: MenuPrintThemeId;
  name: string;
  description: string;
  ink: string;
  palettes: Array<{ background: string; accent: string; soft: string }>;
};

export const menuPrintThemes: MenuPrintTheme[] = [
  {
    id: "fresh",
    name: "Fresh market",
    description: "Bright produce-inspired colours",
    ink: "#1c1917",
    palettes: [
      { background: "#fff1e7", accent: "#d54b28", soft: "#ffd9c8" },
      { background: "#e8f7f3", accent: "#087f6a", soft: "#c8ebe3" },
      { background: "#fff8d9", accent: "#9a5b00", soft: "#ffe7a3" },
      { background: "#f1edff", accent: "#6546b8", soft: "#ddd3ff" }
    ]
  },
  {
    id: "sunset",
    name: "Spice & sunset",
    description: "Warm restaurant and cafeteria tones",
    ink: "#29170f",
    palettes: [
      { background: "#fff2da", accent: "#b83b1e", soft: "#ffd0a6" },
      { background: "#fbe4d7", accent: "#8d2c1c", soft: "#f7bd9c" },
      { background: "#fff4c7", accent: "#8a4b05", soft: "#f8d67a" },
      { background: "#f4e3d7", accent: "#71402d", soft: "#dfbaa5" }
    ]
  },
  {
    id: "midnight",
    name: "Midnight premium",
    description: "Dark backgrounds with jewel accents",
    ink: "#fefce8",
    palettes: [
      { background: "#17201b", accent: "#f3b64a", soft: "#314439" },
      { background: "#17233a", accent: "#7dd3fc", soft: "#263a5f" },
      { background: "#2b1935", accent: "#e9a8ff", soft: "#4a2b59" },
      { background: "#301c1c", accent: "#fca5a5", soft: "#563030" }
    ]
  },
  {
    id: "minimal",
    name: "Minimal studio",
    description: "Low-ink neutral editorial styling",
    ink: "#1c1917",
    palettes: [
      { background: "#fafaf9", accent: "#292524", soft: "#e7e5e4" },
      { background: "#f5f5f4", accent: "#44403c", soft: "#d6d3d1" },
      { background: "#fafaf9", accent: "#57534e", soft: "#e7e5e4" },
      { background: "#f5f5f4", accent: "#292524", soft: "#d6d3d1" }
    ]
  }
];

export type MenuPrintPdfSettings = {
  paperSize: "a4" | "a5";
  defaultLayout: CatalogueLayoutChoice;
  categoryLayouts: Record<string, CatalogueLayoutChoice>;
  heroItemIds: Record<string, string>;
  themeId: MenuPrintThemeId;
  colourMode: "vibrant" | "ink-saver";
  imageFit: MenuPrintImageFit;
  imageFocus: MenuPrintImageFocus;
  backgroundTreatment: MenuPrintBackgroundTreatment;
  showDescriptions: boolean;
  showArabic: boolean;
  showQrCode: boolean;
  showLogo: boolean;
  includeCover: boolean;
  coverTitle: string;
  coverSubtitle: string;
  coverHeroItemId: string;
  includeBackCover: boolean;
  backMessage: string;
};

const layoutChoices = new Set<CatalogueLayoutChoice>([
  "auto",
  "grid",
  "hero",
  "beverage"
]);
const themeIds = new Set<MenuPrintThemeId>(menuPrintThemes.map((theme) => theme.id));

export function parseMenuPrintPdfSettings(value: unknown): MenuPrintPdfSettings | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const paperSize = input.paperSize === "a5" ? "a5" : input.paperSize === "a4" ? "a4" : null;
  const defaultLayout = layoutChoices.has(input.defaultLayout as CatalogueLayoutChoice)
    ? input.defaultLayout as CatalogueLayoutChoice
    : null;
  const themeId = themeIds.has(input.themeId as MenuPrintThemeId)
    ? input.themeId as MenuPrintThemeId
    : null;
  if (!paperSize || !defaultLayout || !themeId) return null;

  return {
    paperSize,
    defaultLayout,
    categoryLayouts: readLayoutRecord(input.categoryLayouts),
    heroItemIds: readStringRecord(input.heroItemIds),
    themeId,
    colourMode: input.colourMode === "ink-saver" ? "ink-saver" : "vibrant",
    imageFit: input.imageFit === "cover" ? "cover" : "contain",
    imageFocus: input.imageFocus === "top" || input.imageFocus === "bottom"
      ? input.imageFocus
      : "center",
    backgroundTreatment:
      input.backgroundTreatment === "blend" || input.backgroundTreatment === "cutout"
        ? input.backgroundTreatment
        : "original",
    showDescriptions: input.showDescriptions === true,
    showArabic: input.showArabic === true,
    showQrCode: input.showQrCode !== false,
    showLogo: input.showLogo !== false,
    includeCover: input.includeCover !== false,
    coverTitle: readText(input.coverTitle, 80, "Our Menu"),
    coverSubtitle: readText(input.coverSubtitle, 140, "Made fresh. Order in a few taps."),
    coverHeroItemId: readText(input.coverHeroItemId, 80, ""),
    includeBackCover: input.includeBackCover !== false,
    backMessage: readText(input.backMessage, 180, "Scan to see our live menu and place your order.")
  };
}

export function getMenuPrintTheme(themeId: MenuPrintThemeId): MenuPrintTheme {
  return menuPrintThemes.find((theme) => theme.id === themeId) ?? menuPrintThemes[0];
}

function readText(value: unknown, maxLength: number, fallback: string): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : fallback;
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, entry]) => key.length <= 80 && typeof entry === "string")
      .slice(0, 100)
      .map(([key, entry]) => [key, (entry as string).slice(0, 80)])
  );
}

function readLayoutRecord(value: unknown): Record<string, CatalogueLayoutChoice> {
  const entries = readStringRecord(value);
  return Object.fromEntries(
    Object.entries(entries).filter(([, layout]) =>
      layoutChoices.has(layout as CatalogueLayoutChoice)
    )
  ) as Record<string, CatalogueLayoutChoice>;
}
