"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  Check,
  FileDown,
  LayoutGrid,
  Palette,
  Printer,
  QrCode
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { buildPrintableMenuSections } from "@/lib/menu-print";
import type { MenuCategory, MenuItem, Restaurant } from "@/lib/types";

type PaperSize = "a4" | "a5";
type PrintTemplate = "modern" | "classic" | "compact";
type ColumnCount = "one" | "two";

const templates: Array<{
  id: PrintTemplate;
  name: string;
  description: string;
}> = [
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
  qrDataUrl,
  restaurant
}: {
  categories: MenuCategory[];
  items: MenuItem[];
  menuUrl: string;
  qrDataUrl: string;
  restaurant: Restaurant;
}) {
  const hasArabic = categories.some((category) => category.name_ar) ||
    items.some((item) => item.name_ar || item.description_ar);
  const [paperSize, setPaperSize] = useState<PaperSize>("a4");
  const [template, setTemplate] = useState<PrintTemplate>("modern");
  const [columnCount, setColumnCount] = useState<ColumnCount>("two");
  const [accentColour, setAccentColour] = useState(accentColours[0]);
  const [showDescriptions, setShowDescriptions] = useState(true);
  const [showArabic, setShowArabic] = useState(hasArabic);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [showQrCode, setShowQrCode] = useState(true);
  const [showLogo, setShowLogo] = useState(Boolean(restaurant.logo_url));
  const sections = useMemo(
    () => buildPrintableMenuSections(categories, items, showUnavailable),
    [categories, items, showUnavailable]
  );
  const printableItemCount = sections.reduce(
    (total, section) => total + section.items.length,
    0
  );
  const paperLabel = paperSize === "a4" ? "A4" : "A5";
  const pageStyle = {
    "--menu-accent": accentColour,
    width: paperSize === "a4" ? "210mm" : "148mm",
    minHeight: paperSize === "a4" ? "297mm" : "210mm"
  } as CSSProperties;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${restaurant.slug}-print-menu`;

    return () => {
      document.title = previousTitle;
    };
  }, [restaurant.slug]);

  function updatePaperSize(value: PaperSize) {
    setPaperSize(value);
    if (value === "a5") {
      setColumnCount("one");
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
        <button
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-leaf px-5 py-3 font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          disabled={printableItemCount === 0}
          onClick={() => window.print()}
          type="button"
        >
          <FileDown size={18} />
          Print / save PDF
        </button>
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
                  onClick={() => setTemplate(option.id)}
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
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["one", "two"] as ColumnCount[]).map((count) => (
                <button
                  aria-pressed={columnCount === count}
                  className={`focus-ring rounded-lg border px-3 py-2 text-sm font-black ${
                    columnCount === count ? "border-leaf bg-mint text-leaf" : "border-stone-200"
                  }`}
                  key={count}
                  onClick={() => setColumnCount(count)}
                  type="button"
                >
                  {count === "one" ? "1 column" : "2 columns"}
                </button>
              ))}
            </div>
          </section>

          <section className="border-t border-stone-200 pt-4">
            <h2 className="font-black">Content</h2>
            <div className="mt-3 grid gap-2">
              <DesignerToggle checked={showDescriptions} label="Descriptions" onChange={setShowDescriptions} />
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

          <div className="rounded-lg bg-stone-50 p-3 text-xs leading-5 text-stone-500">
            <p className="font-black text-stone-700">{printableItemCount} items ready</p>
            <p>
              In the print dialog, choose <strong>Save as PDF</strong> to download the file. Enable
              background graphics for the full colour design.
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
                  // Admin-configured remote logo URLs stay unoptimized so all supported sources render.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={`${restaurant.name} logo`}
                    className="menu-logo"
                    src={restaurant.logo_url}
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
                    {/* QR is generated from the authenticated server page as an embeddable data URL. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={`QR code for ${restaurant.name} online menu`} src={qrDataUrl} />
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
          break-inside: avoid;
          border-bottom: .25mm solid #e7e5e4;
          padding: 0 0 3mm;
          margin: 0 0 3mm;
        }
        .print-menu-item:last-child { margin-bottom: 0; }
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
        .menu-template-compact .menu-category-heading h2 { font-size: 13pt; }
        .menu-template-compact .menu-item-topline h3 { font-size: 9.5pt; }
        .menu-template-compact .menu-description { font-size: 7.5pt; }
        @media print {
          @page { size: ${paperLabel} portrait; margin: 12mm; }
          html, body { background: #fff !important; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .menu-print-page { width: auto !important; }
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
