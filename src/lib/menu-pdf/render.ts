import "server-only";

import type { ReactNode } from "react";
import { Resvg } from "@resvg/resvg-js";
import { PDFDocument } from "pdf-lib";
import satori from "satori";
import { formatCurrency } from "@/lib/currency";
import {
  buildPrintableCataloguePages,
  buildPrintableMenuSections,
  buildPrintableVariantPrices,
  type PrintableCataloguePage,
  type PrintableVariantPrice
} from "@/lib/menu-print";
import {
  getMenuPrintTheme,
  type MenuPrintPdfSettings,
  type MenuPrintTheme
} from "@/lib/menu-pdf-config";
import { imageUrlToDataUri } from "@/lib/poster/subjects";
import { box, img, text, type PosterNode, type PosterStyle } from "@/lib/poster/templates/node";
import type {
  MenuCategory,
  MenuItem,
  MenuOptionCatalog,
  Restaurant
} from "@/lib/types";
import { getMenuPdfFonts } from "./fonts";
import { menuImageToDataUri } from "./images";

type RenderMenuPdfInput = {
  restaurant: Restaurant;
  categories: MenuCategory[];
  items: MenuItem[];
  optionCatalog: MenuOptionCatalog;
  menuUrl: string;
  qrDataUrl: string;
  settings: MenuPrintPdfSettings;
};

type PageDimensions = {
  pixelWidth: number;
  pixelHeight: number;
  pointWidth: number;
  pointHeight: number;
};

type RenderContext = {
  restaurant: Restaurant;
  menuUrl: string;
  qrDataUrl: string;
  settings: MenuPrintPdfSettings;
  theme: MenuPrintTheme;
  dimensions: PageDimensions;
  logoDataUri: string | null;
  imageDataByItemId: Map<string, string>;
  variantPrices: Map<string, PrintableVariantPrice[]>;
};

const PAGE_DIMENSIONS: Record<"a4" | "a5", PageDimensions> = {
  a4: { pixelWidth: 1240, pixelHeight: 1754, pointWidth: 595.28, pointHeight: 841.89 },
  a5: { pixelWidth: 874, pixelHeight: 1240, pointWidth: 419.53, pointHeight: 595.28 }
};

export async function renderMenuPdf(input: RenderMenuPdfInput): Promise<Uint8Array> {
  if (input.items.length > 180) {
    throw new Error("MENU_PDF_TOO_MANY_ITEMS");
  }
  const sections = buildPrintableMenuSections(input.categories, input.items, false);
  const pages = buildPrintableCataloguePages(sections, {
    paperSize: input.settings.paperSize,
    defaultLayout: input.settings.defaultLayout,
    categoryLayouts: input.settings.categoryLayouts,
    heroItemIds: input.settings.heroItemIds
  });
  if (pages.length === 0) throw new Error("MENU_PDF_EMPTY");

  const imageEntries = await mapWithConcurrency(input.items, 6, async (item) => [
    item.id,
    await menuImageToDataUri(item.image_url, input.settings.backgroundTreatment)
  ] as const);
  const context: RenderContext = {
    restaurant: input.restaurant,
    menuUrl: input.menuUrl,
    qrDataUrl: input.qrDataUrl,
    settings: input.settings,
    theme: getMenuPrintTheme(input.settings.themeId),
    dimensions: PAGE_DIMENSIONS[input.settings.paperSize],
    logoDataUri: input.settings.showLogo
      ? await imageUrlToDataUri(input.restaurant.logo_url)
      : null,
    imageDataByItemId: new Map(
      imageEntries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
    ),
    variantPrices: buildPrintableVariantPrices(input.items, input.optionCatalog)
  };
  const coverItem = selectCoverItem(input.items, input.settings.coverHeroItemId);
  const trees: PosterNode[] = [];
  if (input.settings.includeCover) {
    trees.push(buildCoverPage(context, coverItem));
  }
  trees.push(...pages.map((page, index) =>
    buildContentPage(context, page, index + 1, pages.length)
  ));
  if (input.settings.includeBackCover) {
    trees.push(buildBackCoverPage(context));
  }

  const fonts = await getMenuPdfFonts();
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.restaurant.name} menu`);
  pdf.setAuthor(input.restaurant.name);
  pdf.setCreator("WhatsOrder");
  pdf.setProducer("WhatsOrder Print Studio");

  for (const tree of trees) {
    const svg = await satori(tree as unknown as ReactNode, {
      width: context.dimensions.pixelWidth,
      height: context.dimensions.pixelHeight,
      fonts
    });
    const png = Buffer.from(new Resvg(svg, {
      fitTo: { mode: "width", value: context.dimensions.pixelWidth }
    }).render().asPng());
    const embedded = await pdf.embedPng(png);
    const page = pdf.addPage([
      context.dimensions.pointWidth,
      context.dimensions.pointHeight
    ]);
    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: context.dimensions.pointWidth,
      height: context.dimensions.pointHeight
    });
  }

  return pdf.save({ useObjectStreams: true });
}

function buildCoverPage(context: RenderContext, heroItem: MenuItem | null): PosterNode {
  const palette = context.theme.palettes[0];
  const heroImage = heroItem ? context.imageDataByItemId.get(heroItem.id) : null;
  const foreground = context.theme.ink;
  const layers: PosterNode[] = [];
  if (heroImage) {
    layers.push(
      img(heroImage, {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: imageObjectPosition(context.settings.imageFocus)
      }),
      box({
        position: "absolute",
        inset: 0,
        backgroundImage: "linear-gradient(180deg, rgba(0,0,0,.12), rgba(0,0,0,.68))"
      }, [])
    );
  }

  return box(pageRoot(context, heroImage ? "#17201b" : palette.background), [
    ...layers,
    box({
      position: "relative",
      flex: 1,
      flexDirection: "column",
      justifyContent: "space-between",
      padding: scale(context, 72),
      color: heroImage ? "#fffdf5" : foreground
    }, [
      brandRow(context, heroImage ? "#fffdf5" : foreground),
      box({ flexDirection: "column", alignItems: "flex-start", maxWidth: "88%" }, [
        text({
          fontFamily: "Geist Mono",
          fontSize: scale(context, 24),
          letterSpacing: scale(context, 5),
          textTransform: "uppercase",
          color: heroImage ? "#ffd978" : palette.accent
        }, "WHATSORDER PRINT EDITION"),
        text({
          marginTop: scale(context, 24),
          fontFamily: "Bricolage Grotesque",
          fontWeight: 700,
          fontSize: scale(context, 104),
          lineHeight: 0.94,
          letterSpacing: scale(context, -4),
          color: heroImage ? "#fffdf5" : foreground,
          lineClamp: 2
        }, context.settings.coverTitle),
        text({
          marginTop: scale(context, 28),
          fontFamily: "Bricolage Grotesque",
          fontSize: scale(context, 34),
          lineHeight: 1.25,
          color: heroImage ? "#f5f5f4" : foreground,
          lineClamp: 3
        }, context.settings.coverSubtitle)
      ]),
      box({ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, [
        heroItem
          ? text({
              fontFamily: "Bricolage Grotesque",
              fontWeight: 700,
              fontSize: scale(context, 28),
              color: heroImage ? "#fffdf5" : foreground
            }, heroItem.name)
          : text({ fontFamily: "Geist Mono", fontSize: scale(context, 22), color: foreground }, context.menuUrl),
        context.settings.showQrCode
          ? box({ alignItems: "center", gap: scale(context, 16) }, [
              img(context.qrDataUrl, {
                width: scale(context, 126),
                height: scale(context, 126),
                backgroundColor: "#fff",
                padding: scale(context, 8),
                borderRadius: scale(context, 12)
              }),
              text({ fontFamily: "Geist Mono", fontSize: scale(context, 19), color: heroImage ? "#fff" : foreground }, "SCAN TO ORDER")
            ])
          : null
      ])
    ])
  ]);
}

function buildContentPage(
  context: RenderContext,
  page: PrintableCataloguePage,
  pageIndex: number,
  pageCount: number
): PosterNode {
  const categoryIndex = pageIndex - 1;
  const sourcePalette = context.theme.palettes[categoryIndex % context.theme.palettes.length];
  const palette = context.settings.colourMode === "ink-saver"
    ? { background: "#ffffff", accent: sourcePalette.accent, soft: "#f5f5f4" }
    : sourcePalette;
  const body = page.layout === "hero"
    ? buildHeroBody(context, page.items, palette)
    : buildGridBody(context, page.items, palette, page.layout === "beverage");

  return box(pageRoot(context, palette.background), [
    box({ flex: 1, flexDirection: "column", padding: scale(context, 52), gap: scale(context, 24) }, [
      brandRow(context, context.theme.ink),
      box({
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        borderBottom: `${scale(context, 7)}px solid ${palette.accent}`,
        paddingBottom: scale(context, 20)
      }, [
        box({ flexDirection: "column" }, [
          text({
            fontFamily: "Geist Mono",
            fontSize: scale(context, 18),
            letterSpacing: scale(context, 4),
            color: palette.accent
          }, "OUR MENU"),
          text({
            fontFamily: "Bricolage Grotesque",
            fontWeight: 700,
            fontSize: scale(context, 64),
            lineHeight: 0.95,
            color: context.theme.ink,
            textTransform: "uppercase",
            lineClamp: 1
          }, page.category.name),
          context.settings.showArabic && page.category.name_ar
            ? arabicText({ marginTop: scale(context, 8), fontSize: scale(context, 30), color: context.theme.ink }, page.category.name_ar)
            : null
        ]),
        text({
          fontFamily: "Geist Mono",
          fontSize: scale(context, 18),
          color: palette.accent
        }, page.categoryPageCount > 1 ? `${page.categoryPage} / ${page.categoryPageCount}` : page.layout.toUpperCase())
      ]),
      body,
      box({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderTop: `1px solid ${palette.soft}`,
        paddingTop: scale(context, 14)
      }, [
        text({ fontFamily: "Geist Mono", fontSize: scale(context, 16), color: palette.accent }, context.menuUrl.replace(/^https?:\/\//, "")),
        text({ fontFamily: "Geist Mono", fontSize: scale(context, 16), color: palette.accent }, `${pageIndex} / ${pageCount}`)
      ])
    ])
  ]);
}

function buildGridBody(
  context: RenderContext,
  items: MenuItem[],
  palette: { background: string; accent: string; soft: string },
  beverage: boolean
): PosterNode {
  const columns = beverage && context.settings.paperSize === "a4" ? 3 : 2;
  const rows = chunk(items, columns);
  return box({ flex: 1, minHeight: 0, flexDirection: "column", gap: scale(context, 18) },
    rows.map((row) => box({ flex: 1, flexDirection: "row", gap: scale(context, 18) },
      row.map((item) => buildItemCard(context, item, palette, { flex: 1, beverage }))
    ))
  );
}

function buildHeroBody(
  context: RenderContext,
  items: MenuItem[],
  palette: { background: string; accent: string; soft: string }
): PosterNode {
  const hero = items[0];
  const side = items.slice(1, 3);
  const lower = items.slice(3, 5);
  return box({ flex: 1, minHeight: 0, flexDirection: "column", gap: scale(context, 18) }, [
    box({ flex: lower.length > 0 ? 2 : 1, minHeight: 0, flexDirection: "row", gap: scale(context, 18) }, [
      buildItemCard(context, hero, palette, { flex: 1.2, hero: true }),
      side.length > 0
        ? box({ flex: 0.8, minHeight: 0, flexDirection: "column", gap: scale(context, 18) },
            side.map((item) => buildItemCard(context, item, palette, { flex: 1 })))
        : null
    ]),
    lower.length > 0
      ? box({ flex: 1, minHeight: 0, flexDirection: "row", gap: scale(context, 18) },
          lower.map((item) => buildItemCard(context, item, palette, { flex: 1 })))
      : null
  ]);
}

function buildItemCard(
  context: RenderContext,
  item: MenuItem,
  palette: { background: string; accent: string; soft: string },
  options: { flex: number; hero?: boolean; beverage?: boolean }
): PosterNode {
  const imageData = context.imageDataByItemId.get(item.id);
  const prices = context.variantPrices.get(item.id) ?? [];
  const imageHeight = options.hero ? "66%" : options.beverage ? "64%" : "58%";
  return box({
    flex: options.flex,
    minWidth: 0,
    minHeight: 0,
    flexDirection: "column",
    overflow: "hidden",
    borderRadius: scale(context, options.beverage ? 34 : 22),
    backgroundColor: "#ffffff",
    border: `1px solid ${palette.soft}`
  }, [
    box({
      position: "relative",
      width: "100%",
      height: imageHeight,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: palette.soft,
      overflow: "hidden"
    }, [
      imageData
        ? img(imageData, {
            width: "100%",
            height: "100%",
            objectFit: context.settings.imageFit,
            objectPosition: imageObjectPosition(context.settings.imageFocus),
            padding: context.settings.imageFit === "contain" ? scale(context, 10) : 0
          })
        : text({ fontFamily: "Geist Mono", fontSize: scale(context, 16), color: palette.accent }, "PHOTO COMING SOON"),
      item.is_featured || options.hero
        ? text({
            position: "absolute",
            top: scale(context, 14),
            left: scale(context, 14),
            borderRadius: 999,
            padding: `${scale(context, 8)}px ${scale(context, 14)}px`,
            backgroundColor: "#ffffff",
            color: palette.accent,
            fontFamily: "Geist Mono",
            fontSize: scale(context, 14)
          }, options.hero ? "SIGNATURE" : options.beverage ? "MUST TRY" : "POPULAR")
        : null
    ]),
    box({ flex: 1, minHeight: 0, flexDirection: "column", padding: scale(context, 18) }, [
      box({ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: scale(context, 12) }, [
        box({ flex: 1, minWidth: 0, flexDirection: "column" }, [
          text({
            fontFamily: "Bricolage Grotesque",
            fontWeight: 700,
            fontSize: scale(context, options.hero ? 30 : 23),
            lineHeight: 1.05,
            color: "#1c1917",
            lineClamp: 2
          }, item.name),
          context.settings.showArabic && item.name_ar
            ? arabicText({ marginTop: scale(context, 6), fontSize: scale(context, 19), color: "#44403c" }, item.name_ar)
            : null
        ]),
        prices.length === 0
          ? text(priceStyle(context, palette.accent), formatCurrency(item.price, context.restaurant))
          : null
      ]),
      prices.length > 0 ? buildVariantPrices(context, prices, palette) : null,
      context.settings.showDescriptions && item.description
        ? text({
            marginTop: scale(context, 8),
            fontFamily: "Bricolage Grotesque",
            fontSize: scale(context, 16),
            lineHeight: 1.25,
            color: "#57534e",
            lineClamp: 2
          }, item.description)
        : null
    ])
  ]);
}

function buildVariantPrices(
  context: RenderContext,
  prices: PrintableVariantPrice[],
  palette: { accent: string; soft: string }
): PosterNode {
  return box({ flexDirection: "row", flexWrap: "wrap", gap: scale(context, 7), marginTop: scale(context, 10) },
    prices.map((variant) => box({
      borderRadius: 999,
      padding: `${scale(context, 6)}px ${scale(context, 10)}px`,
      backgroundColor: palette.soft,
      gap: scale(context, 6)
    }, [
      text({ fontFamily: "Bricolage Grotesque", fontWeight: 700, fontSize: scale(context, 14), color: palette.accent }, variant.label),
      text({ fontFamily: "Geist Mono", fontSize: scale(context, 13), color: palette.accent }, formatCurrency(variant.price, context.restaurant))
    ]))
  );
}

function buildBackCoverPage(context: RenderContext): PosterNode {
  const palette = context.theme.palettes[1 % context.theme.palettes.length];
  return box(pageRoot(context, palette.background), [
    box({
      flex: 1,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "space-between",
      padding: scale(context, 78),
      textAlign: "center"
    }, [
      brandRow(context, context.theme.ink),
      box({ flexDirection: "column", alignItems: "center", maxWidth: "82%" }, [
        text({
          fontFamily: "Bricolage Grotesque",
          fontWeight: 700,
          fontSize: scale(context, 72),
          lineHeight: 1,
          color: context.theme.ink,
          lineClamp: 2
        }, "Ready to order?"),
        text({
          marginTop: scale(context, 28),
          fontFamily: "Bricolage Grotesque",
          fontSize: scale(context, 30),
          lineHeight: 1.3,
          color: context.theme.ink,
          lineClamp: 4
        }, context.settings.backMessage),
        context.settings.showQrCode
          ? img(context.qrDataUrl, {
              marginTop: scale(context, 44),
              width: scale(context, 300),
              height: scale(context, 300),
              padding: scale(context, 18),
              borderRadius: scale(context, 24),
              backgroundColor: "#ffffff"
            })
          : null,
        text({
          marginTop: scale(context, 24),
          fontFamily: "Geist Mono",
          fontSize: scale(context, 22),
          color: palette.accent
        }, context.menuUrl.replace(/^https?:\/\//, ""))
      ]),
      box({ flexDirection: "column", alignItems: "center", gap: scale(context, 8) }, [
        context.restaurant.address
          ? text({ fontFamily: "Bricolage Grotesque", fontSize: scale(context, 22), color: context.theme.ink }, context.restaurant.address)
          : null,
        text({ fontFamily: "Geist Mono", fontSize: scale(context, 20), color: palette.accent }, `WHATSAPP ${context.restaurant.whatsapp_number}`)
      ])
    ])
  ]);
}

function brandRow(context: RenderContext, color: string): PosterNode {
  return box({ width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, [
    box({ alignItems: "center", gap: scale(context, 16) }, [
      context.logoDataUri
        ? img(context.logoDataUri, {
            width: scale(context, 72),
            height: scale(context, 72),
            borderRadius: scale(context, 36),
            objectFit: "contain",
            backgroundColor: "#ffffff"
          })
        : null,
      box({ flexDirection: "column" }, [
        text({ fontFamily: "Bricolage Grotesque", fontWeight: 700, fontSize: scale(context, 30), color }, context.restaurant.name),
        context.settings.showArabic && context.restaurant.name_ar
          ? arabicText({ fontSize: scale(context, 20), color }, context.restaurant.name_ar)
          : null
      ])
    ]),
    text({ fontFamily: "Geist Mono", fontSize: scale(context, 16), color }, "MENU · WHATSORDER")
  ]);
}

function arabicText(style: PosterStyle, content: string): PosterNode {
  return text({
    fontFamily: "Cairo",
    fontWeight: 700,
    direction: "rtl",
    textAlign: "right",
    lineHeight: 1.25,
    ...style
  }, content);
}

function priceStyle(context: RenderContext, accent: string): PosterStyle {
  return {
    flexShrink: 0,
    borderRadius: scale(context, 12),
    padding: `${scale(context, 8)}px ${scale(context, 12)}px`,
    backgroundColor: accent,
    color: "#ffffff",
    fontFamily: "Geist Mono",
    fontSize: scale(context, 16)
  };
}

function pageRoot(context: RenderContext, backgroundColor: string): PosterStyle {
  return {
    position: "relative",
    width: context.dimensions.pixelWidth,
    height: context.dimensions.pixelHeight,
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor
  };
}

function imageObjectPosition(focus: MenuPrintPdfSettings["imageFocus"]): string {
  return focus === "top" ? "center top" : focus === "bottom" ? "center bottom" : "center";
}

function scale(context: RenderContext, value: number): number {
  return Math.round(value * (context.dimensions.pixelWidth / 1240));
}

function selectCoverItem(items: MenuItem[], selectedId: string): MenuItem | null {
  return items.find((item) => item.id === selectedId && item.image_url) ??
    items.find((item) => item.is_featured && item.image_url) ??
    items.find((item) => item.image_url) ??
    null;
}

function chunk<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const result = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      result[index] = await mapper(values[index]);
    }
  }));
  return result;
}
