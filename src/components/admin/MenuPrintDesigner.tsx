"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Download,
  FileDown,
  ImageIcon,
  LayoutGrid,
  Loader2,
  Palette,
  Printer,
  QrCode
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import {
  buildPrintableCataloguePages,
  buildPrintableMenuSections,
  buildPrintableVariantPrices,
  type CatalogueLayoutChoice
} from "@/lib/menu-print";
import {
  getMenuPrintTheme,
  menuPrintThemes,
  parseMenuPrintPdfSettings,
  type MenuPrintBackgroundTreatment,
  type MenuPrintImageFit,
  type MenuPrintImageFocus,
  type MenuPrintPdfSettings,
  type MenuPrintThemeId
} from "@/lib/menu-pdf-config";
import type {
  MenuCategory,
  MenuItem,
  MenuOptionCatalog,
  Restaurant
} from "@/lib/types";

type PaperSize = "a4" | "a5";
type PrintTemplate = "catalogue" | "modern" | "classic" | "compact";
type ColumnCount = "one" | "two";
type PrintColourMode = "vibrant" | "ink-saver";
type ImageQuality = "good" | "low" | "error";

const catalogueLayouts: Array<{
  id: CatalogueLayoutChoice;
  name: string;
  description: string;
}> = [
  { id: "auto", name: "Smart layout", description: "Matches each category automatically" },
  { id: "grid", name: "Photo grid", description: "Balanced catalogue cards" },
  { id: "hero", name: "Hero + grid", description: "One large signature product" },
  { id: "beverage", name: "Beverage showcase", description: "Tall product-forward cards" }
];

const templates: Array<{
  id: PrintTemplate;
  name: string;
  description: string;
}> = [
  { id: "catalogue", name: "Photo catalogue", description: "Large photos and bold price cards" },
  { id: "modern", name: "Modern", description: "Clean and colourful" },
  { id: "classic", name: "Classic", description: "Elegant and centred" },
  { id: "compact", name: "Compact", description: "Fits more items" }
];

const accentColours = ["#1f8a5b", "#b45309", "#9f1239", "#1d4ed8", "#17201b"];
function DesignerToggle({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2 text-sm font-bold text-stone-700">
      {label}
      <input
        checked={checked}
        className="h-4 w-4 accent-leaf"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}

export function MenuPrintDesigner({
  categories,
  items,
  menuUrl,
  optionCatalog,
  qrDataUrl,
  restaurant
}: {
  categories: MenuCategory[];
  items: MenuItem[];
  menuUrl: string;
  optionCatalog: MenuOptionCatalog;
  qrDataUrl: string;
  restaurant: Restaurant;
}) {
  const hasArabic = categories.some((category) => category.name_ar) ||
    items.some((item) => item.name_ar || item.description_ar);
  const hasItemPhotos = items.some((item) => item.image_url);
  const [paperSize, setPaperSize] = useState<PaperSize>("a4");
  const [template, setTemplate] = useState<PrintTemplate>(
    hasItemPhotos ? "catalogue" : "modern"
  );
  const [columnCount, setColumnCount] = useState<ColumnCount>("two");
  const [colourMode, setColourMode] = useState<PrintColourMode>("vibrant");
  const [themeId, setThemeId] = useState<MenuPrintThemeId>("fresh");
  const [catalogueLayout, setCatalogueLayout] = useState<CatalogueLayoutChoice>("auto");
  const [categoryLayouts, setCategoryLayouts] = useState<
    Record<string, CatalogueLayoutChoice>
  >({});
  const [heroItemIds, setHeroItemIds] = useState<Record<string, string>>({});
  const [imageFit, setImageFit] = useState<MenuPrintImageFit>("contain");
  const [imageFocus, setImageFocus] = useState<MenuPrintImageFocus>("center");
  const [backgroundTreatment, setBackgroundTreatment] =
    useState<MenuPrintBackgroundTreatment>("original");
  const [includeCover, setIncludeCover] = useState(true);
  const [coverTitle, setCoverTitle] = useState("Our Menu");
  const [coverSubtitle, setCoverSubtitle] = useState("Made fresh. Order in a few taps.");
  const [coverHeroItemId, setCoverHeroItemId] = useState("");
  const [includeBackCover, setIncludeBackCover] = useState(true);
  const [backMessage, setBackMessage] = useState(
    "Scan to see our live menu and place your order."
  );
  const [themeSettingsReady, setThemeSettingsReady] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [accentColour, setAccentColour] = useState(accentColours[0]);
  const [showDescriptions, setShowDescriptions] = useState(!hasItemPhotos);
  const [showItemPhotos, setShowItemPhotos] = useState(hasItemPhotos);
  const [showArabic, setShowArabic] = useState(hasArabic);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [showQrCode, setShowQrCode] = useState(true);
  const [showLogo, setShowLogo] = useState(Boolean(restaurant.logo_url));
  const [imageQuality, setImageQuality] = useState<Record<string, ImageQuality>>({});
  const sections = useMemo(
    () => buildPrintableMenuSections(categories, items, showUnavailable),
    [categories, items, showUnavailable]
  );
  const printableItemCount = sections.reduce(
    (total, section) => total + section.items.length,
    0
  );
  const cataloguePages = useMemo(
    () => buildPrintableCataloguePages(sections, {
      paperSize,
      defaultLayout: catalogueLayout,
      categoryLayouts,
      heroItemIds
    }),
    [catalogueLayout, categoryLayouts, heroItemIds, paperSize, sections]
  );
  const variantPrices = useMemo(
    () => buildPrintableVariantPrices(items, optionCatalog),
    [items, optionCatalog]
  );
  const categoryIndexById = useMemo(
    () => new Map(sections.map((section, index) => [section.category.id, index])),
    [sections]
  );
  const activeTheme = getMenuPrintTheme(themeId);
  const totalCataloguePages = cataloguePages.length +
    (includeCover ? 1 : 0) +
    (includeBackCover ? 1 : 0);
  const coverHeroItem = items.find(
    (item) => item.id === coverHeroItemId && item.image_url
  ) ?? items.find((item) => item.is_featured && item.image_url) ??
    items.find((item) => item.image_url) ?? null;
  const pdfSettings = useMemo<MenuPrintPdfSettings>(() => ({
    paperSize,
    defaultLayout: catalogueLayout,
    categoryLayouts,
    heroItemIds,
    themeId,
    colourMode,
    imageFit,
    imageFocus,
    backgroundTreatment,
    showDescriptions,
    showArabic,
    showQrCode,
    showLogo,
    includeCover,
    coverTitle,
    coverSubtitle,
    coverHeroItemId,
    includeBackCover,
    backMessage
  }), [
    backMessage,
    backgroundTreatment,
    catalogueLayout,
    categoryLayouts,
    colourMode,
    coverHeroItemId,
    coverSubtitle,
    coverTitle,
    heroItemIds,
    imageFit,
    imageFocus,
    includeBackCover,
    includeCover,
    paperSize,
    showArabic,
    showDescriptions,
    showLogo,
    showQrCode,
    themeId
  ]);
  const missingPhotoCount = sections.reduce(
    (total, section) => total + section.items.filter((item) => !item.image_url).length,
    0
  );
  const lowQualityPhotoCount = Object.values(imageQuality).filter(
    (quality) => quality === "low" || quality === "error"
  ).length;
  const paperLabel = paperSize === "a4" ? "A4" : "A5";
  const pageStyle = {
    "--menu-accent": accentColour,
    width: paperSize === "a4" ? "210mm" : "148mm",
    minHeight: paperSize === "a4" ? "297mm" : "210mm"
  } as CSSProperties;

  function checkImageQuality(itemId: string, image: HTMLImageElement) {
    const quality: ImageQuality =
      image.naturalWidth < 800 || image.naturalHeight < 600 ? "low" : "good";
    setImageQuality((current) =>
      current[itemId] === quality ? current : { ...current, [itemId]: quality }
    );
  }

  function markImageError(itemId: string) {
    setImageQuality((current) =>
      current[itemId] === "error" ? current : { ...current, [itemId]: "error" }
    );
  }

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${restaurant.slug}-print-menu`;

    return () => {
      document.title = previousTitle;
    };
  }, [restaurant.slug]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`whatsorder:print-theme:v1:${restaurant.id}`);
      const parsed = stored ? parseMenuPrintPdfSettings(JSON.parse(stored)) : null;
      if (parsed) {
        setPaperSize(parsed.paperSize);
        setCatalogueLayout(parsed.defaultLayout);
        setCategoryLayouts(parsed.categoryLayouts);
        setHeroItemIds(parsed.heroItemIds);
        setThemeId(parsed.themeId);
        setColourMode(parsed.colourMode);
        setImageFit(parsed.imageFit);
        setImageFocus(parsed.imageFocus);
        setBackgroundTreatment(parsed.backgroundTreatment);
        setShowDescriptions(parsed.showDescriptions);
        setShowArabic(parsed.showArabic);
        setShowQrCode(parsed.showQrCode);
        setShowLogo(parsed.showLogo);
        setIncludeCover(parsed.includeCover);
        setCoverTitle(parsed.coverTitle);
        setCoverSubtitle(parsed.coverSubtitle);
        setCoverHeroItemId(parsed.coverHeroItemId);
        setIncludeBackCover(parsed.includeBackCover);
        setBackMessage(parsed.backMessage);
      }
    } catch {
      // A corrupt browser preference should never block the print designer.
    } finally {
      setThemeSettingsReady(true);
    }
  }, [restaurant.id]);

  useEffect(() => {
    if (!themeSettingsReady) return;
    try {
      localStorage.setItem(
        `whatsorder:print-theme:v1:${restaurant.id}`,
        JSON.stringify(pdfSettings)
      );
    } catch {
      // Private browsing or a full storage quota must not block menu design.
    }
  }, [pdfSettings, restaurant.id, themeSettingsReady]);

  function updatePaperSize(value: PaperSize) {
    setPaperSize(value);
    if (value === "a5") {
      setColumnCount("one");
    }
  }

  function updateCategoryLayout(categoryId: string, value: string) {
    setCategoryLayouts((current) => {
      const next = { ...current };
      if (value) {
        next[categoryId] = value as CatalogueLayoutChoice;
      } else {
        delete next[categoryId];
      }
      return next;
    });
  }

  function updateHeroItem(categoryId: string, itemId: string) {
    setHeroItemIds((current) => ({ ...current, [categoryId]: itemId }));
  }

  function scrollToPrintPage(pageIndex: number) {
    document.getElementById(`catalogue-page-${pageIndex + 1}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  async function downloadProfessionalPdf() {
    setGeneratingPdf(true);
    setPdfError(null);
    try {
      const response = await fetch("/api/menu/print-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pdfSettings)
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "The PDF could not be generated.");
      }
      const downloadUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = `${restaurant.slug}-menu.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "The PDF could not be generated.");
    } finally {
      setGeneratingPdf(false);
    }
  }

  return (
    <main className="menu-print-page mx-auto max-w-[1500px] px-4 py-6 sm:px-6 print:max-w-none print:p-0">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <Link
            className="focus-ring inline-flex items-center gap-2 text-sm font-black text-leaf"
            href="/admin/menu"
          >
            <ArrowLeft size={16} />
            Back to menu
          </Link>
          <h1 className="mt-2 text-3xl font-black">Create printable menu</h1>
          <p className="mt-1 text-sm text-stone-500">
            Design once, then print or save as a PDF from your browser.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            className="focus-ring inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-3 font-black text-stone-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            disabled={printableItemCount === 0 || generatingPdf}
            onClick={() => window.print()}
            type="button"
          >
            <FileDown size={18} />
            Browser print
          </button>
          <button
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-leaf px-5 py-3 font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            disabled={printableItemCount === 0 || generatingPdf || template !== "catalogue"}
            onClick={downloadProfessionalPdf}
            type="button"
          >
            {generatingPdf ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
            {generatingPdf ? "Building PDF…" : "Download designed PDF"}
          </button>
          {pdfError ? (
            <p className="w-full text-right text-sm font-bold text-red-700" role="alert">{pdfError}</p>
          ) : null}
        </div>
      </div>

      <div className="grid items-start gap-6 print:block xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm print:hidden xl:sticky xl:top-5">
          <section>
            <div className="flex items-center gap-2">
              <Palette className="text-leaf" size={18} />
              <h2 className="font-black">Style</h2>
            </div>
            <div className="mt-3 grid gap-2">
              {templates.map((option) => (
                <button
                  aria-pressed={template === option.id}
                  className={`focus-ring flex items-center justify-between rounded-lg border px-3 py-3 text-left ${
                    template === option.id
                      ? "border-leaf bg-mint"
                      : "border-stone-200 hover:border-stone-300"
                  }`}
                  key={option.id}
                  onClick={() => {
                    setTemplate(option.id);
                    if (option.id === "catalogue") {
                      setShowItemPhotos(true);
                    }
                  }}
                  type="button"
                >
                  <span>
                    <span className="block text-sm font-black">{option.name}</span>
                    <span className="mt-0.5 block text-xs text-stone-500">
                      {option.description}
                    </span>
                  </span>
                  {template === option.id ? <Check className="text-leaf" size={17} /> : null}
                </button>
              ))}
            </div>
            {template === "catalogue" ? (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {(["vibrant", "ink-saver"] as PrintColourMode[]).map((mode) => (
                    <button
                      aria-pressed={colourMode === mode}
                      className={`focus-ring rounded-lg border px-3 py-2 text-sm font-black ${
                        colourMode === mode
                          ? "border-leaf bg-mint text-leaf"
                          : "border-stone-200"
                      }`}
                      key={mode}
                      onClick={() => setColourMode(mode)}
                      type="button"
                    >
                      {mode === "vibrant" ? "Vibrant" : "Ink saver"}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-wide text-stone-500" htmlFor="print-theme">
                    Restaurant theme
                  </label>
                  <select
                    className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-bold"
                    id="print-theme"
                    onChange={(event) => setThemeId(event.target.value as MenuPrintThemeId)}
                    value={themeId}
                  >
                    {menuPrintThemes.map((theme) => (
                      <option key={theme.id} value={theme.id}>
                        {theme.name} — {theme.description}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-stone-500">
                    Saved automatically for this restaurant on this device.
                  </p>
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-wide text-stone-500" htmlFor="catalogue-layout">
                    Catalogue layout
                  </label>
                  <select
                    className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-bold"
                    id="catalogue-layout"
                    onChange={(event) => setCatalogueLayout(event.target.value as CatalogueLayoutChoice)}
                    value={catalogueLayout}
                  >
                    {catalogueLayouts.map((layout) => (
                      <option key={layout.id} value={layout.id}>
                        {layout.name} — {layout.description}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-black text-stone-600">
                    Photo crop
                    <select
                      className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm"
                      onChange={(event) => setImageFit(event.target.value as MenuPrintImageFit)}
                      value={imageFit}
                    >
                      <option value="contain">Show full item</option>
                      <option value="cover">Fill frame</option>
                    </select>
                  </label>
                  <label className="text-xs font-black text-stone-600">
                    Focus
                    <select
                      className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm"
                      onChange={(event) => setImageFocus(event.target.value as MenuPrintImageFocus)}
                      value={imageFocus}
                    >
                      <option value="top">Top</option>
                      <option value="center">Centre</option>
                      <option value="bottom">Bottom</option>
                    </select>
                  </label>
                </div>
                <label className="block text-xs font-black text-stone-600">
                  Background treatment
                  <select
                    className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm"
                    onChange={(event) => setBackgroundTreatment(event.target.value as MenuPrintBackgroundTreatment)}
                    value={backgroundTreatment}
                  >
                    <option value="original">Original photo</option>
                    <option value="blend">Blend light backgrounds</option>
                    <option value="cutout">Auto cutout — plain backgrounds</option>
                  </select>
                </label>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                {accentColours.map((colour) => (
                  <button
                    aria-label={`Use ${colour} as the menu colour`}
                    aria-pressed={accentColour === colour}
                    className={`focus-ring h-9 w-9 rounded-full border-2 ${
                      accentColour === colour ? "border-ink" : "border-white"
                    } shadow ring-1 ring-stone-200`}
                    key={colour}
                    onClick={() => setAccentColour(colour)}
                    style={{ backgroundColor: colour }}
                    type="button"
                  />
                ))}
              </div>
            )}
          </section>

          <section className="border-t border-stone-200 pt-4">
            <div className="flex items-center gap-2">
              <LayoutGrid className="text-leaf" size={18} />
              <h2 className="font-black">Page</h2>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["a4", "a5"] as PaperSize[]).map((size) => (
                <button
                  aria-pressed={paperSize === size}
                  className={`focus-ring rounded-lg border px-3 py-2 text-sm font-black uppercase ${
                    paperSize === size ? "border-leaf bg-mint text-leaf" : "border-stone-200"
                  }`}
                  key={size}
                  onClick={() => updatePaperSize(size)}
                  type="button"
                >
                  {size}
                </button>
              ))}
            </div>
            {template !== "catalogue" ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["one", "two"] as ColumnCount[]).map((count) => (
                  <button
                    aria-pressed={columnCount === count}
                    className={`focus-ring rounded-lg border px-3 py-2 text-sm font-black ${
                      columnCount === count
                        ? "border-leaf bg-mint text-leaf"
                        : "border-stone-200"
                    }`}
                    key={count}
                    onClick={() => setColumnCount(count)}
                    type="button"
                  >
                    {count === "one" ? "1 column" : "2 columns"}
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          {template === "catalogue" ? (
            <details className="border-t border-stone-200 pt-4">
              <summary className="cursor-pointer font-black">Category layouts</summary>
              <p className="mt-1 text-xs leading-5 text-stone-500">
                Override the smart layout or choose the product shown as the category hero.
              </p>
              <div className="mt-3 space-y-3">
                {sections.map((section) => {
                  const photoItems = section.items.filter((item) => item.image_url);
                  return (
                    <div className="rounded-lg border border-stone-200 p-3" key={section.category.id}>
                      <p className="text-sm font-black">{section.category.name}</p>
                      <label className="mt-2 block text-xs font-bold text-stone-600">
                        Layout
                        <select
                          className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm"
                          onChange={(event) => updateCategoryLayout(section.category.id, event.target.value)}
                          value={categoryLayouts[section.category.id] ?? ""}
                        >
                          <option value="">Use global setting</option>
                          {catalogueLayouts.map((layout) => (
                            <option key={layout.id} value={layout.id}>{layout.name}</option>
                          ))}
                        </select>
                      </label>
                      {photoItems.length > 0 ? (
                        <label className="mt-2 block text-xs font-bold text-stone-600">
                          Hero product
                          <select
                            className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm"
                            onChange={(event) => updateHeroItem(section.category.id, event.target.value)}
                            value={heroItemIds[section.category.id] ?? ""}
                          >
                            <option value="">Automatic featured item</option>
                            {photoItems.map((item) => (
                              <option key={item.id} value={item.id}>{item.name}</option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}

          {template === "catalogue" ? (
            <details className="border-t border-stone-200 pt-4" open>
              <summary className="cursor-pointer font-black">Cover & back page</summary>
              <div className="mt-3 space-y-3">
                <DesignerToggle checked={includeCover} label="Front cover" onChange={setIncludeCover} />
                {includeCover ? (
                  <div className="space-y-2 rounded-lg border border-stone-200 p-3">
                    <label className="block text-xs font-bold text-stone-600">
                      Cover title
                      <input
                        className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-2 py-2 text-sm"
                        maxLength={80}
                        onChange={(event) => setCoverTitle(event.target.value)}
                        value={coverTitle}
                      />
                    </label>
                    <label className="block text-xs font-bold text-stone-600">
                      Cover subtitle
                      <textarea
                        className="focus-ring mt-1 min-h-16 w-full resize-y rounded-lg border border-stone-200 px-2 py-2 text-sm"
                        maxLength={140}
                        onChange={(event) => setCoverSubtitle(event.target.value)}
                        value={coverSubtitle}
                      />
                    </label>
                    <label className="block text-xs font-bold text-stone-600">
                      Cover photo
                      <select
                        className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm"
                        onChange={(event) => setCoverHeroItemId(event.target.value)}
                        value={coverHeroItemId}
                      >
                        <option value="">Automatic featured item</option>
                        {items.filter((item) => item.image_url).map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}
                <DesignerToggle checked={includeBackCover} label="Back cover" onChange={setIncludeBackCover} />
                {includeBackCover ? (
                  <label className="block text-xs font-bold text-stone-600">
                    Back-page message
                    <textarea
                      className="focus-ring mt-1 min-h-20 w-full resize-y rounded-lg border border-stone-200 px-2 py-2 text-sm"
                      maxLength={180}
                      onChange={(event) => setBackMessage(event.target.value)}
                      value={backMessage}
                    />
                  </label>
                ) : null}
              </div>
            </details>
          ) : null}

          <section className="border-t border-stone-200 pt-4">
            <h2 className="font-black">Content</h2>
            <div className="mt-3 grid gap-2">
              <DesignerToggle checked={showDescriptions} label="Descriptions" onChange={setShowDescriptions} />
              {hasItemPhotos && template !== "catalogue" ? (
                <DesignerToggle checked={showItemPhotos} label="Item photos" onChange={setShowItemPhotos} />
              ) : null}
              {hasArabic ? (
                <DesignerToggle checked={showArabic} label="Arabic text" onChange={setShowArabic} />
              ) : null}
              <DesignerToggle checked={showUnavailable} label="Unavailable items" onChange={setShowUnavailable} />
              <DesignerToggle checked={showQrCode} label="Order QR code" onChange={setShowQrCode} />
              {restaurant.logo_url ? (
                <DesignerToggle checked={showLogo} label="Restaurant logo" onChange={setShowLogo} />
              ) : null}
            </div>
          </section>

          {template === "catalogue" && cataloguePages.length > 0 ? (
            <section className="border-t border-stone-200 pt-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-black">Page preview</h2>
                <span className="text-xs font-bold text-stone-500">{totalCataloguePages} pages</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {includeCover ? (
                  <button
                    className="focus-ring rounded-lg border border-stone-200 bg-stone-50 p-2 text-left hover:border-leaf"
                    onClick={() => document.getElementById("catalogue-cover")?.scrollIntoView({ behavior: "smooth" })}
                    type="button"
                  >
                    <span className="thumbnail-layout thumbnail-cover" aria-hidden="true"><span /></span>
                    <span className="mt-1 block text-[11px] font-black">1. Front cover</span>
                    <span className="block text-[10px] text-stone-500">Editorial cover</span>
                  </button>
                ) : null}
                {cataloguePages.map((page, pageIndex) => (
                  <button
                    aria-label={`Go to page ${pageIndex + 1}: ${page.category.name}`}
                    className="focus-ring rounded-lg border border-stone-200 bg-stone-50 p-2 text-left hover:border-leaf"
                    key={`${page.category.id}-thumbnail-${page.categoryPage}`}
                    onClick={() => scrollToPrintPage(pageIndex)}
                    type="button"
                  >
                    <span className={`thumbnail-layout thumbnail-${page.layout}`} aria-hidden="true">
                      {page.items.map((item, itemIndex) => (
                        <span key={item.id} className={itemIndex === 0 ? "thumbnail-first" : undefined} />
                      ))}
                    </span>
                    <span className="mt-1 block truncate text-[11px] font-black">
                      {pageIndex + 1 + (includeCover ? 1 : 0)}. {page.category.name}
                    </span>
                    <span className="block text-[10px] capitalize text-stone-500">
                      {page.layout === "beverage" ? "Beverage showcase" : page.layout}
                    </span>
                  </button>
                ))}
                {includeBackCover ? (
                  <button
                    className="focus-ring rounded-lg border border-stone-200 bg-stone-50 p-2 text-left hover:border-leaf"
                    onClick={() => document.getElementById("catalogue-back-cover")?.scrollIntoView({ behavior: "smooth" })}
                    type="button"
                  >
                    <span className="thumbnail-layout thumbnail-back" aria-hidden="true"><span /></span>
                    <span className="mt-1 block text-[11px] font-black">{totalCataloguePages}. Back cover</span>
                    <span className="block text-[10px] text-stone-500">QR and contact</span>
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          {template === "catalogue" && (missingPhotoCount > 0 || lowQualityPhotoCount > 0) ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
              <div className="flex items-center gap-2 font-black">
                <AlertTriangle size={16} />
                Photo check
              </div>
              {missingPhotoCount > 0 ? (
                <p className="mt-1">
                  {missingPhotoCount} {missingPhotoCount === 1 ? "item has" : "items have"} no photo.
                </p>
              ) : null}
              {lowQualityPhotoCount > 0 ? (
                <p className="mt-1">
                  {lowQualityPhotoCount} {lowQualityPhotoCount === 1 ? "photo is" : "photos are"} low-resolution or could not load.
                </p>
              ) : null}
              <p className="mt-1 text-amber-800">Use images at least 800 × 600 px for clearer printing.</p>
            </div>
          ) : null}

          <div className="rounded-lg bg-stone-50 p-3 text-xs leading-5 text-stone-500">
            <p className="font-black text-stone-700">{printableItemCount} items ready</p>
            {template === "catalogue" ? (
              <p>{totalCataloguePages} print {totalCataloguePages === 1 ? "page" : "pages"}</p>
            ) : null}
            <p>
              In the print dialog, choose <strong>Save as PDF</strong> to download the file. Enable
              background graphics for the full colour design, and untick{" "}
              <strong>Headers and footers</strong> so the date and page URL don&apos;t print.
            </p>
          </div>
        </aside>

        <div className="overflow-auto rounded-xl bg-stone-200/70 p-4 print:overflow-visible print:rounded-none print:bg-white print:p-0 sm:p-8">
          {printableItemCount === 0 ? (
            <div className="mx-auto max-w-lg rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center shadow-sm print:hidden">
              <Printer className="mx-auto text-stone-300" size={44} />
              <h2 className="mt-4 text-xl font-black">No printable items yet</h2>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                Add an available menu item, or enable unavailable items in the content options.
              </p>
            </div>
          ) : template === "catalogue" ? (
            <div
              className={`catalogue-document catalogue-${colourMode} catalogue-treatment-${backgroundTreatment}`}
              data-paper={paperSize}
            >
              {includeCover ? (
                <section
                  className="catalogue-page catalogue-cover-page"
                  id="catalogue-cover"
                  style={{
                    ...pageStyle,
                    "--catalogue-bg": activeTheme.palettes[0].background,
                    "--catalogue-accent": activeTheme.palettes[0].accent,
                    "--catalogue-soft": activeTheme.palettes[0].soft,
                    "--catalogue-ink": activeTheme.ink
                  } as CSSProperties}
                >
                  {coverHeroItem?.image_url ? (
                    <Image
                      alt={coverHeroItem.name}
                      className={`catalogue-cover-photo catalogue-fit-${imageFit} catalogue-focus-${imageFocus}`}
                      height={1400}
                      src={coverHeroItem.image_url}
                      unoptimized
                      width={1000}
                    />
                  ) : null}
                  <div className="catalogue-cover-scrim" />
                  <div className="catalogue-cover-content">
                    <div className="catalogue-cover-brand">
                      {showLogo && restaurant.logo_url ? (
                        <Image alt={`${restaurant.name} logo`} height={160} src={restaurant.logo_url} unoptimized width={160} />
                      ) : null}
                      <span>{restaurant.name}</span>
                    </div>
                    <div className="catalogue-cover-copy">
                      <p>WhatsOrder print edition</p>
                      <h1>{coverTitle || "Our Menu"}</h1>
                      {coverSubtitle ? <h2>{coverSubtitle}</h2> : null}
                    </div>
                    <div className="catalogue-cover-footer">
                      <span>{coverHeroItem?.name ?? menuUrl.replace(/^https?:\/\//, "")}</span>
                      {showQrCode ? (
                        <div>
                          <Image alt="Order menu QR code" height={160} src={qrDataUrl} unoptimized width={160} />
                          <b>Scan to order</b>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>
              ) : null}
              {cataloguePages.map((page, pageIndex) => {
                const categoryIndex = categoryIndexById.get(page.category.id) ?? 0;
                const palette = activeTheme.palettes[
                  categoryIndex % activeTheme.palettes.length
                ];
                const cataloguePageStyle = {
                  ...pageStyle,
                  "--catalogue-bg": palette.background,
                  "--catalogue-accent": palette.accent,
                  "--catalogue-soft": palette.soft,
                  "--catalogue-ink": activeTheme.ink
                } as CSSProperties;

                return (
                  <section
                    className={`catalogue-page catalogue-page-${page.layout}`}
                    id={`catalogue-page-${pageIndex + 1}`}
                    key={`${page.category.id}-${page.categoryPage}`}
                    style={cataloguePageStyle}
                  >
                    <header className="catalogue-brand-row">
                      <div className="catalogue-brand">
                        {showLogo && restaurant.logo_url ? (
                          <Image
                            alt={`${restaurant.name} logo`}
                            className="catalogue-logo"
                            height={160}
                            src={restaurant.logo_url}
                            unoptimized
                            width={160}
                          />
                        ) : null}
                        <div>
                          <p>{restaurant.name}</p>
                          {showArabic && restaurant.name_ar ? (
                            <span dir="rtl">{restaurant.name_ar}</span>
                          ) : null}
                        </div>
                      </div>
                      {showQrCode ? (
                        <div className="catalogue-qr">
                          <Image
                            alt={`QR code for ${restaurant.name} online menu`}
                            height={128}
                            src={qrDataUrl}
                            unoptimized
                            width={128}
                          />
                          <span>Scan to order</span>
                        </div>
                      ) : null}
                    </header>

                    <div className="catalogue-category-row">
                      <div>
                        <p className="catalogue-kicker">Our menu</p>
                        <h1>{page.category.name}</h1>
                        {showArabic && page.category.name_ar ? (
                          <p className="catalogue-category-ar" dir="rtl">
                            {page.category.name_ar}
                          </p>
                        ) : null}
                      </div>
                      {page.categoryPageCount > 1 ? (
                        <span className="catalogue-category-page">
                          {page.categoryPage} / {page.categoryPageCount}
                        </span>
                      ) : null}
                    </div>

                    <div className="catalogue-grid">
                      {page.items.map((item, itemIndex) => {
                        const itemVariantPrices = variantPrices.get(item.id) ?? [];
                        const featuredLabel = page.layout === "hero" && itemIndex === 0
                          ? "Signature"
                          : page.layout === "beverage"
                            ? "Must try"
                            : "Popular";
                        return (
                        <article
                          className={`catalogue-card ${itemIndex === 0 ? "catalogue-card-first" : ""}`}
                          key={item.id}
                        >
                          <div className="catalogue-photo-wrap">
                            {item.image_url ? (
                              <Image
                                alt={item.name}
                                className={`catalogue-photo catalogue-fit-${imageFit} catalogue-focus-${imageFocus}`}
                                height={700}
                                onError={() => markImageError(item.id)}
                                onLoad={(event) => checkImageQuality(item.id, event.currentTarget)}
                                src={item.image_url}
                                unoptimized
                                width={900}
                              />
                            ) : (
                              <div className="catalogue-photo-placeholder">
                                <ImageIcon aria-hidden="true" size={30} />
                                <span>Photo coming soon</span>
                              </div>
                            )}
                            {item.is_featured || (page.layout === "hero" && itemIndex === 0) ? (
                              <span className="catalogue-popular">{featuredLabel}</span>
                            ) : null}
                            {!item.is_available ? (
                              <span className="catalogue-unavailable">Unavailable</span>
                            ) : null}
                          </div>
                          <div className="catalogue-card-copy">
                            <div className="catalogue-name-row">
                              <div>
                                <h2>{item.name}</h2>
                                {showArabic && item.name_ar ? (
                                  <p className="catalogue-name-ar" dir="rtl">
                                    {item.name_ar}
                                  </p>
                                ) : null}
                              </div>
                              {itemVariantPrices.length === 0 ? (
                                <span className="catalogue-price">
                                  {formatCurrency(item.price, restaurant)}
                                </span>
                              ) : null}
                            </div>
                            {itemVariantPrices.length > 0 ? (
                              <div className="catalogue-variant-prices">
                                {itemVariantPrices.map((variant) => (
                                  <span key={`${item.id}-${variant.label}`}>
                                    <b>
                                      {variant.label}
                                      {showArabic && variant.labelAr ? ` / ${variant.labelAr}` : ""}
                                    </b>
                                    {formatCurrency(variant.price, restaurant)}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            {showDescriptions && item.description ? (
                              <p className="catalogue-description">{item.description}</p>
                            ) : null}
                            {showArabic && showDescriptions && item.description_ar ? (
                              <p className="catalogue-description catalogue-description-ar" dir="rtl">
                                {item.description_ar}
                              </p>
                            ) : null}
                          </div>
                        </article>
                        );
                      })}
                    </div>

                    <footer className="catalogue-footer">
                      <div>
                        {restaurant.address ? <span>{restaurant.address}</span> : null}
                        {restaurant.whatsapp_number ? (
                          <span>WhatsApp: {restaurant.whatsapp_number}</span>
                        ) : null}
                      </div>
                      <div className="catalogue-footer-link">
                        {showQrCode ? <QrCode aria-hidden="true" size={14} /> : null}
                        <span>{menuUrl.replace(/^https?:\/\//, "")}</span>
                      </div>
                      <span className="catalogue-document-page">
                        {pageIndex + 1 + (includeCover ? 1 : 0)} / {totalCataloguePages}
                      </span>
                    </footer>
                  </section>
                );
              })}
              {includeBackCover ? (
                <section
                  className="catalogue-page catalogue-back-cover-page"
                  id="catalogue-back-cover"
                  style={{
                    ...pageStyle,
                    "--catalogue-bg": activeTheme.palettes[1 % activeTheme.palettes.length].background,
                    "--catalogue-accent": activeTheme.palettes[1 % activeTheme.palettes.length].accent,
                    "--catalogue-soft": activeTheme.palettes[1 % activeTheme.palettes.length].soft,
                    "--catalogue-ink": activeTheme.ink
                  } as CSSProperties}
                >
                  <div className="catalogue-back-content">
                    <div className="catalogue-cover-brand">
                      {showLogo && restaurant.logo_url ? (
                        <Image alt={`${restaurant.name} logo`} height={160} src={restaurant.logo_url} unoptimized width={160} />
                      ) : null}
                      <span>{restaurant.name}</span>
                    </div>
                    <div className="catalogue-back-order">
                      <h1>Ready to order?</h1>
                      <p>{backMessage}</p>
                      {showQrCode ? (
                        <Image alt="Order menu QR code" height={320} src={qrDataUrl} unoptimized width={320} />
                      ) : null}
                      <b>{menuUrl.replace(/^https?:\/\//, "")}</b>
                    </div>
                    <div className="catalogue-back-contact">
                      {restaurant.address ? <span>{restaurant.address}</span> : null}
                      <span>WhatsApp: {restaurant.whatsapp_number}</span>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <article
              className={`print-menu-document menu-template-${template} mx-auto bg-white p-[12mm] text-stone-950 shadow-2xl print:p-0 print:shadow-none ${
                columnCount === "two" ? "menu-two-columns" : "menu-one-column"
              }`}
              data-paper={paperSize}
              style={pageStyle}
            >
              <header className="menu-brand-header">
                {showLogo && restaurant.logo_url ? (
                  <Image
                    alt={`${restaurant.name} logo`}
                    className="menu-logo"
                    height={160}
                    src={restaurant.logo_url}
                    unoptimized
                    width={160}
                  />
                ) : null}
                <div className="menu-brand-copy">
                  <p className="menu-kicker">Our menu</p>
                  <h1>{restaurant.name}</h1>
                  {showArabic && restaurant.name_ar ? (
                    <p className="menu-restaurant-ar" dir="rtl">{restaurant.name_ar}</p>
                  ) : null}
                  {restaurant.subtitle ? <p className="menu-subtitle">{restaurant.subtitle}</p> : null}
                </div>
                {showQrCode ? (
                  <div className="menu-header-qr">
                    <Image
                      alt={`QR code for ${restaurant.name} online menu`}
                      height={128}
                      src={qrDataUrl}
                      unoptimized
                      width={128}
                    />
                    <span>Scan to order</span>
                  </div>
                ) : null}
              </header>

              <div className="menu-rule" />

              <div className="print-menu-sections">
                {sections.map((section) => (
                  <section className="print-menu-section" key={section.category.id}>
                    <header className="menu-category-heading">
                      <h2>{section.category.name}</h2>
                      {showArabic && section.category.name_ar ? (
                        <p dir="rtl">{section.category.name_ar}</p>
                      ) : null}
                    </header>
                    <div className="menu-item-list">
                      {section.items.map((item) => (
                        <article className="print-menu-item" key={item.id}>
                          {showItemPhotos && item.image_url ? (
                            <Image
                              alt=""
                              className="menu-item-photo"
                              height={240}
                              src={item.image_url}
                              unoptimized
                              width={240}
                            />
                          ) : null}
                          <div className="menu-item-copy">
                            <div className="menu-item-topline">
                              <h3>
                                {item.name}
                                {item.is_featured ? <span className="menu-bestseller">Popular</span> : null}
                                {!item.is_available ? <span className="menu-unavailable">Unavailable</span> : null}
                              </h3>
                              <span className="menu-price">{formatCurrency(item.price, restaurant)}</span>
                            </div>
                            {showDescriptions && item.description ? (
                              <p className="menu-description">{item.description}</p>
                            ) : null}
                            {showArabic && item.name_ar ? (
                              <div className="menu-arabic-copy" dir="rtl">
                                <p className="menu-name-ar">{item.name_ar}</p>
                                {showDescriptions && item.description_ar ? (
                                  <p>{item.description_ar}</p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              <footer className="print-menu-footer">
                <div>
                  {restaurant.address ? <p>{restaurant.address}</p> : null}
                  {restaurant.whatsapp_number ? <p>WhatsApp: {restaurant.whatsapp_number}</p> : null}
                </div>
                {showQrCode ? (
                  <div className="menu-footer-order-link">
                    <QrCode aria-hidden="true" size={14} />
                    <span>{menuUrl.replace(/^https?:\/\//, "")}</span>
                  </div>
                ) : null}
              </footer>
            </article>
          )}
        </div>
      </div>

      <style>{`
        .thumbnail-layout {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-template-rows: repeat(3, 8px);
          gap: 2px;
          height: 34px;
          overflow: hidden;
          border-radius: 3px;
          padding: 3px;
          background: #e7e5e4;
        }
        .thumbnail-layout > span { border-radius: 2px; background: #fff; }
        .thumbnail-hero .thumbnail-first { grid-row: span 2; background: #bbf7d0; }
        .thumbnail-beverage { grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(2, 12px); }
        .thumbnail-beverage > span { background: #dbeafe; }
        .thumbnail-cover > span { grid-column: 1 / -1; grid-row: 1 / -1; background: linear-gradient(145deg, #f3b64a, #17201b); }
        .thumbnail-back > span { grid-column: 1 / -1; grid-row: 1 / -1; background: radial-gradient(circle, #fff 0 20%, #c8ebe3 21%); }
        .catalogue-document {
          display: grid;
          gap: 8mm;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .catalogue-page {
          --catalogue-bg: #fff1e7;
          --catalogue-accent: #d54b28;
          --catalogue-soft: #ffd9c8;
          --catalogue-ink: #1c1917;
          box-sizing: border-box;
          display: grid;
          grid-template-rows: auto auto minmax(0, 1fr) auto;
          gap: 5mm;
          overflow: hidden;
          padding: 10mm;
          background: var(--catalogue-bg);
          color: var(--catalogue-ink);
          box-shadow: 0 20px 45px rgb(28 25 23 / 18%);
        }
        .catalogue-cover-page, .catalogue-back-cover-page {
          position: relative;
          display: block;
          padding: 0;
        }
        .catalogue-cover-photo {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .catalogue-cover-photo.catalogue-focus-top { object-position: center top; }
        .catalogue-cover-photo.catalogue-focus-bottom { object-position: center bottom; }
        .catalogue-cover-photo.catalogue-focus-left { object-position: left center; }
        .catalogue-cover-photo.catalogue-focus-right { object-position: right center; }
        .catalogue-cover-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgb(0 0 0 / 12%), rgb(0 0 0 / 72%));
        }
        .catalogue-cover-page:not(:has(.catalogue-cover-photo)) .catalogue-cover-scrim { display: none; }
        .catalogue-cover-content, .catalogue-back-content {
          position: relative;
          z-index: 1;
          box-sizing: border-box;
          display: flex;
          height: 100%;
          flex-direction: column;
          justify-content: space-between;
          padding: 15mm;
          color: #fff;
        }
        .catalogue-cover-page:not(:has(.catalogue-cover-photo)) .catalogue-cover-content { color: var(--catalogue-ink); }
        .catalogue-cover-brand { display: flex; align-items: center; gap: 4mm; font-size: 15pt; font-weight: 950; }
        .catalogue-cover-brand img { width: 18mm; height: 18mm; border-radius: 50%; object-fit: contain; background: #fff; }
        .catalogue-cover-copy { max-width: 88%; }
        .catalogue-cover-copy p { margin: 0 0 5mm; color: var(--catalogue-accent); font-size: 8pt; font-weight: 950; letter-spacing: .18em; text-transform: uppercase; }
        .catalogue-cover-page:has(.catalogue-cover-photo) .catalogue-cover-copy p { color: #ffd978; }
        .catalogue-cover-copy h1 { margin: 0; font-size: 49pt; font-weight: 950; letter-spacing: -.055em; line-height: .92; }
        .catalogue-cover-copy h2 { max-width: 80%; margin: 7mm 0 0; font-size: 16pt; line-height: 1.25; }
        .catalogue-cover-footer { display: flex; align-items: end; justify-content: space-between; gap: 6mm; font-size: 10pt; font-weight: 900; }
        .catalogue-cover-footer > div { display: flex; align-items: center; gap: 3mm; }
        .catalogue-cover-footer img { width: 23mm; height: 23mm; border-radius: 2mm; background: #fff; }
        .catalogue-cover-footer b { font-size: 7pt; text-transform: uppercase; }
        .catalogue-back-content { align-items: center; color: var(--catalogue-ink); text-align: center; }
        .catalogue-back-content .catalogue-cover-brand { align-self: stretch; }
        .catalogue-back-order { display: flex; max-width: 82%; flex-direction: column; align-items: center; }
        .catalogue-back-order h1 { margin: 0; font-size: 36pt; line-height: 1; }
        .catalogue-back-order p { margin: 7mm 0 0; font-size: 15pt; line-height: 1.35; }
        .catalogue-back-order img { width: 55mm; height: 55mm; margin-top: 10mm; border-radius: 4mm; background: #fff; padding: 3mm; }
        .catalogue-back-order b { margin-top: 5mm; color: var(--catalogue-accent); font-size: 9pt; }
        .catalogue-back-contact { display: flex; flex-direction: column; gap: 1mm; font-size: 9pt; font-weight: 800; }
        .catalogue-document[data-paper="a5"] .catalogue-cover-content,
        .catalogue-document[data-paper="a5"] .catalogue-back-content { padding: 10mm; }
        .catalogue-document[data-paper="a5"] .catalogue-cover-copy h1 { font-size: 35pt; }
        .catalogue-document[data-paper="a5"] .catalogue-cover-copy h2 { font-size: 12pt; }
        .catalogue-document[data-paper="a5"] .catalogue-back-order h1 { font-size: 28pt; }
        .catalogue-document[data-paper="a5"] .catalogue-back-order p { font-size: 11pt; }
        .catalogue-document[data-paper="a5"] .catalogue-back-order img { width: 42mm; height: 42mm; }
        .catalogue-document[data-paper="a4"] .catalogue-page { height: 297mm; }
        .catalogue-document[data-paper="a5"] .catalogue-page { height: 210mm; padding: 8mm; gap: 3.5mm; }
        .catalogue-brand-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6mm;
          min-height: 17mm;
        }
        .catalogue-brand { display: flex; align-items: center; gap: 3mm; min-width: 0; }
        .catalogue-logo {
          width: 16mm;
          height: 16mm;
          flex: 0 0 auto;
          border-radius: 50%;
          object-fit: contain;
          background: #fff;
        }
        .catalogue-brand p { margin: 0; font-size: 12pt; font-weight: 950; line-height: 1.05; }
        .catalogue-brand span { display: block; margin-top: 1mm; font-size: 8pt; font-weight: 800; }
        .catalogue-qr { display: flex; align-items: center; gap: 2mm; font-size: 7pt; font-weight: 900; }
        .catalogue-qr img { width: 15mm; height: 15mm; }
        .catalogue-category-row {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 5mm;
          border-bottom: 1.2mm solid var(--catalogue-accent);
          padding-bottom: 3mm;
        }
        .catalogue-kicker {
          margin: 0 0 1mm;
          color: var(--catalogue-accent);
          font-size: 7pt;
          font-weight: 950;
          letter-spacing: .18em;
          text-transform: uppercase;
        }
        .catalogue-category-row h1 {
          margin: 0;
          color: var(--catalogue-accent);
          font-size: 25pt;
          font-weight: 950;
          letter-spacing: -.045em;
          line-height: .95;
          text-transform: uppercase;
        }
        .catalogue-category-ar { margin: 1mm 0 0; font-size: 12pt; font-weight: 900; }
        .catalogue-category-page {
          border-radius: 999px;
          padding: 1.5mm 3mm;
          background: var(--catalogue-soft);
          color: var(--catalogue-accent);
          font-size: 7pt;
          font-weight: 950;
        }
        .catalogue-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-template-rows: repeat(3, minmax(0, 1fr));
          gap: 4.5mm;
          min-height: 0;
        }
        .catalogue-page-hero .catalogue-card-first { grid-row: span 2; }
        .catalogue-page-hero .catalogue-card-first .catalogue-name-row h2 { font-size: 15pt; }
        .catalogue-page-hero .catalogue-card-first .catalogue-name-ar { font-size: 11pt; }
        .catalogue-page-beverage .catalogue-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          grid-template-rows: repeat(2, minmax(0, 1fr));
        }
        .catalogue-page-beverage .catalogue-card { border-radius: 9mm 9mm 4mm 4mm; }
        .catalogue-page-beverage .catalogue-photo-wrap { min-height: 0; }
        .catalogue-page-beverage .catalogue-photo { padding: 2mm; }
        .catalogue-document[data-paper="a5"] .catalogue-grid {
          grid-template-rows: repeat(2, minmax(0, 1fr));
          gap: 3mm;
        }
        .catalogue-document[data-paper="a5"] .catalogue-page-beverage .catalogue-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .catalogue-card {
          display: grid;
          grid-template-rows: minmax(0, 1fr) auto;
          min-height: 0;
          overflow: hidden;
          border: .3mm solid rgb(255 255 255 / 76%);
          border-radius: 4mm;
          background: rgb(255 255 255 / 90%);
          box-shadow: 0 2.5mm 6mm rgb(66 40 24 / 10%);
        }
        .catalogue-photo-wrap {
          position: relative;
          min-height: 0;
          overflow: hidden;
          background: linear-gradient(145deg, var(--catalogue-soft), rgb(255 255 255 / 55%));
        }
        .catalogue-photo {
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center;
          filter: drop-shadow(0 2mm 2.5mm rgb(41 25 17 / 18%));
        }
        .catalogue-photo.catalogue-fit-cover { object-fit: cover; padding: 0; filter: none; }
        .catalogue-photo.catalogue-fit-contain { object-fit: contain; }
        .catalogue-photo.catalogue-focus-top { object-position: center top; }
        .catalogue-photo.catalogue-focus-center { object-position: center; }
        .catalogue-photo.catalogue-focus-bottom { object-position: center bottom; }
        .catalogue-treatment-blend .catalogue-photo,
        .catalogue-treatment-cutout .catalogue-photo { mix-blend-mode: multiply; }
        .catalogue-photo-placeholder {
          display: flex;
          height: 100%;
          min-height: 28mm;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 2mm;
          color: var(--catalogue-accent);
          font-size: 7pt;
          font-weight: 850;
          opacity: .7;
        }
        .catalogue-popular, .catalogue-unavailable {
          position: absolute;
          top: 2.5mm;
          left: 2.5mm;
          border-radius: 999px;
          padding: 1.2mm 2.5mm;
          font-size: 6pt;
          font-weight: 950;
          letter-spacing: .06em;
          text-transform: uppercase;
        }
        .catalogue-popular { background: #fff; color: var(--catalogue-accent); }
        .catalogue-unavailable { right: 2.5mm; left: auto; background: #292524; color: #fff; }
        .catalogue-card-copy { padding: 3mm; }
        .catalogue-name-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 3mm; }
        .catalogue-name-row > div { min-width: 0; }
        .catalogue-name-row h2 {
          margin: 0;
          font-size: 10.5pt;
          font-weight: 950;
          letter-spacing: -.02em;
          line-height: 1.12;
        }
        .catalogue-name-ar { margin: 1mm 0 0; font-size: 8.5pt; font-weight: 800; line-height: 1.1; }
        .catalogue-price {
          flex: 0 0 auto;
          border-radius: 2.5mm;
          padding: 1.4mm 2.2mm;
          background: var(--catalogue-accent);
          color: #fff;
          font-size: 8pt;
          font-weight: 950;
          white-space: nowrap;
        }
        .catalogue-variant-prices {
          display: flex;
          flex-wrap: wrap;
          gap: 1.2mm;
          margin-top: 2mm;
        }
        .catalogue-variant-prices span {
          display: inline-flex;
          align-items: center;
          gap: 1.2mm;
          border-radius: 999px;
          padding: 1mm 1.8mm;
          background: var(--catalogue-soft);
          color: var(--catalogue-accent);
          font-size: 6.5pt;
          font-weight: 900;
          white-space: nowrap;
        }
        .catalogue-variant-prices b { font-weight: 950; }
        .catalogue-description {
          display: -webkit-box;
          overflow: hidden;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          margin: 1.5mm 0 0;
          color: #57534e;
          font-size: 7pt;
          line-height: 1.3;
        }
        .catalogue-description-ar { -webkit-line-clamp: 1; }
        .catalogue-footer {
          display: grid;
          grid-template-columns: 1fr auto auto;
          align-items: center;
          gap: 4mm;
          border-top: .3mm solid color-mix(in srgb, var(--catalogue-accent) 35%, transparent);
          padding-top: 2.5mm;
          color: #57534e;
          font-size: 6.5pt;
          font-weight: 750;
        }
        .catalogue-footer > div:first-child { display: flex; gap: 3mm; min-width: 0; }
        .catalogue-footer-link { display: flex; align-items: center; gap: 1.5mm; color: var(--catalogue-accent); }
        .catalogue-document-page { color: var(--catalogue-accent); font-weight: 950; }
        .catalogue-ink-saver .catalogue-page { background: #fff; }
        .catalogue-ink-saver .catalogue-card {
          border-color: #d6d3d1;
          box-shadow: none;
          background: #fff;
        }
        .catalogue-ink-saver .catalogue-photo-wrap { background: #f5f5f4; }
        .catalogue-ink-saver .catalogue-price { border: .3mm solid currentColor; background: #fff; color: var(--catalogue-accent); }
        .catalogue-ink-saver .catalogue-variant-prices span { border: .25mm solid currentColor; background: #fff; }
        .catalogue-document[data-paper="a5"] .catalogue-category-row h1 { font-size: 19pt; }
        .catalogue-document[data-paper="a5"] .catalogue-brand p { font-size: 10pt; }
        .catalogue-document[data-paper="a5"] .catalogue-logo { width: 13mm; height: 13mm; }
        .catalogue-document[data-paper="a5"] .catalogue-qr img { width: 12mm; height: 12mm; }
        .catalogue-document[data-paper="a5"] .catalogue-name-row h2 { font-size: 8.5pt; }
        .catalogue-document[data-paper="a5"] .catalogue-name-ar { font-size: 7.5pt; }
        .catalogue-document[data-paper="a5"] .catalogue-price { font-size: 6.5pt; }
        .catalogue-document[data-paper="a5"] .catalogue-variant-prices span { font-size: 5.5pt; padding: .7mm 1.2mm; }
        .catalogue-document[data-paper="a5"] .catalogue-card-copy { padding: 2.2mm; }
        .catalogue-document[data-paper="a5"] .catalogue-description { font-size: 6pt; }
        .print-menu-document {
          --menu-accent: #1f8a5b;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .menu-brand-header {
          display: flex;
          align-items: center;
          gap: 6mm;
        }
        .menu-logo {
          width: 25mm;
          height: 25mm;
          flex: 0 0 auto;
          border-radius: 50%;
          object-fit: contain;
        }
        .menu-brand-copy { min-width: 0; flex: 1; }
        .menu-kicker {
          margin: 0 0 1.5mm;
          color: var(--menu-accent);
          font-size: 9pt;
          font-weight: 900;
          letter-spacing: .16em;
          text-transform: uppercase;
        }
        .menu-brand-copy h1 {
          margin: 0;
          font-size: 27pt;
          font-weight: 950;
          letter-spacing: -.035em;
          line-height: 1.05;
        }
        .menu-restaurant-ar { margin: 1.5mm 0 0; font-size: 14pt; font-weight: 800; }
        .menu-subtitle { margin: 2mm 0 0; color: #57534e; font-size: 9pt; }
        .menu-header-qr { flex: 0 0 auto; text-align: center; }
        .menu-header-qr img { display: block; width: 22mm; height: 22mm; }
        .menu-header-qr span { display: block; margin-top: 1mm; font-size: 7pt; font-weight: 800; }
        .menu-rule { height: 1.2mm; margin: 7mm 0; background: var(--menu-accent); }
        .print-menu-sections { column-fill: balance; }
        .menu-two-columns .print-menu-sections { column-count: 2; column-gap: 10mm; }
        .menu-two-columns .print-menu-sections { column-rule: .25mm solid #e7e5e4; }
        .print-menu-section { margin: 0 0 8mm; }
        .menu-category-heading {
          break-after: avoid;
          border-bottom: .6mm solid var(--menu-accent);
          margin-bottom: 3mm;
          padding-bottom: 1.5mm;
        }
        .menu-category-heading h2 {
          margin: 0;
          color: var(--menu-accent);
          font-size: 15pt;
          font-weight: 950;
          letter-spacing: -.02em;
        }
        .menu-category-heading p { margin: .5mm 0 0; font-size: 10pt; font-weight: 800; }
        .print-menu-item {
          display: flex;
          align-items: flex-start;
          gap: 3mm;
          break-inside: avoid;
          border-bottom: .25mm solid #e7e5e4;
          padding: 0 0 3mm;
          margin: 0 0 3mm;
        }
        .print-menu-item:last-child { margin-bottom: 0; }
        .menu-item-photo {
          width: 16mm;
          height: 16mm;
          flex: 0 0 auto;
          border-radius: 2mm;
          object-fit: cover;
        }
        .menu-item-copy { min-width: 0; flex: 1; }
        .menu-item-topline { display: flex; align-items: baseline; justify-content: space-between; gap: 4mm; }
        .menu-item-topline h3 { margin: 0; font-size: 10.5pt; font-weight: 900; line-height: 1.25; }
        .menu-price { flex: 0 0 auto; color: var(--menu-accent); font-size: 10pt; font-weight: 950; white-space: nowrap; }
        .menu-bestseller, .menu-unavailable {
          display: inline-block;
          margin-left: 1.5mm;
          border-radius: 999px;
          padding: .6mm 1.5mm;
          vertical-align: 1px;
          font-size: 5.5pt;
          font-weight: 950;
          letter-spacing: .05em;
          text-transform: uppercase;
        }
        .menu-bestseller { background: #fef3c7; color: #92400e; }
        .menu-unavailable { background: #f5f5f4; color: #78716c; }
        .menu-description { margin: 1mm 0 0; color: #57534e; font-size: 8pt; line-height: 1.4; }
        .menu-arabic-copy { margin-top: 1mm; color: #57534e; font-size: 8pt; line-height: 1.45; }
        .menu-arabic-copy p { margin: 0; }
        .menu-arabic-copy .menu-name-ar { color: #292524; font-size: 9pt; font-weight: 800; }
        .print-menu-footer {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 6mm;
          break-inside: avoid;
          border-top: .4mm solid #d6d3d1;
          margin-top: 8mm;
          padding-top: 4mm;
          color: #57534e;
          font-size: 7.5pt;
          line-height: 1.45;
        }
        .print-menu-footer p { margin: 0; }
        .menu-footer-order-link { display: flex; align-items: center; gap: 1.5mm; font-weight: 800; }
        .menu-template-classic { font-family: Georgia, "Times New Roman", serif; }
        .menu-template-classic .menu-brand-header { display: block; text-align: center; }
        .menu-template-classic .menu-logo { margin: 0 auto 4mm; }
        .menu-template-classic .menu-header-qr { margin-top: 4mm; }
        .menu-template-classic .menu-header-qr img { margin: 0 auto; }
        .menu-template-classic .menu-kicker { color: #57534e; }
        .menu-template-classic .menu-rule { height: .4mm; background: #292524; }
        .menu-template-classic .menu-category-heading { border-bottom-style: double; border-bottom-width: 1mm; text-align: center; }
        .menu-template-classic .menu-category-heading h2, .menu-template-classic .menu-price { color: #292524; }
        .menu-template-classic .menu-item-topline h3 { font-weight: 700; }
        .menu-template-compact { padding: 9mm; }
        .menu-template-compact .menu-brand-copy h1 { font-size: 23pt; }
        .menu-template-compact .menu-rule { margin: 5mm 0; }
        .menu-template-compact .print-menu-section { margin-bottom: 5mm; }
        .menu-template-compact .print-menu-item { margin-bottom: 2mm; padding-bottom: 2mm; }
        .menu-template-compact .menu-item-photo { width: 12mm; height: 12mm; }
        .menu-template-compact .menu-category-heading h2 { font-size: 13pt; }
        .menu-template-compact .menu-item-topline h3 { font-size: 9.5pt; }
        .menu-template-compact .menu-description { font-size: 7.5pt; }
        @media print {
          @page { size: ${paperLabel} portrait; margin: ${template === "catalogue" ? "0" : "12mm"}; }
          html, body { background: #fff !important; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .menu-print-page { width: auto !important; }
          .catalogue-document { display: block; }
          .catalogue-page {
            break-after: page;
            page-break-after: always;
            box-shadow: none !important;
          }
          .catalogue-page:last-child { break-after: auto; page-break-after: auto; }
          .print-menu-document {
            width: auto !important;
            min-height: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
          .menu-template-compact { padding: 0 !important; }
        }
      `}</style>
    </main>
  );
}
