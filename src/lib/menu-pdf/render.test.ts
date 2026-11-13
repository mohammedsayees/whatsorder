import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderMenuPdf } from "@/lib/menu-pdf/render";
import type { MenuPrintPdfSettings } from "@/lib/menu-pdf-config";
import type { MenuCategory, MenuItem, Restaurant } from "@/lib/types";

const restaurant: Restaurant = {
  id: "restaurant-1",
  name: "Print Cafe",
  name_ar: "مقهى الطباعة",
  slug: "print-cafe",
  logo_url: null,
  whatsapp_number: "971500000000",
  address: "Dubai",
  delivery_fee: 0,
  minimum_order_amount: 0,
  is_active: true,
  created_at: "2026-01-01"
};
const category: MenuCategory = {
  id: "drinks",
  restaurant_id: restaurant.id,
  name: "Fresh Juices",
  name_ar: "عصائر طازجة",
  display_order: 0,
  is_active: true,
  created_at: "2026-01-01"
};
const item: MenuItem = {
  id: "mango",
  restaurant_id: restaurant.id,
  category_id: category.id,
  name: "Mango Juice",
  name_ar: "عصير مانجو",
  description: "Fresh mango blended to order",
  price: 12,
  image_url: "https://images.example/mango.png",
  is_available: true,
  is_featured: true,
  created_at: "2026-01-01"
};
const settings: MenuPrintPdfSettings = {
  paperSize: "a5",
  defaultLayout: "auto",
  categoryLayouts: {},
  heroItemIds: {},
  themeId: "fresh",
  colourMode: "vibrant",
  imageFit: "contain",
  imageFocus: "center",
  backgroundTreatment: "cutout",
  showDescriptions: true,
  showArabic: true,
  showQrCode: true,
  showLogo: true,
  includeCover: true,
  coverTitle: "Our Menu",
  coverSubtitle: "Fresh every day",
  coverHeroItemId: item.id,
  includeBackCover: true,
  backMessage: "Scan to order"
};

afterEach(() => vi.unstubAllGlobals());

describe("renderMenuPdf", () => {
  it("creates a bilingual cover, menu page and back cover PDF", async () => {
    const productImage = await sharp({
      create: { width: 400, height: 300, channels: 3, background: "white" }
    }).composite([{ input: await sharp({
      create: { width: 180, height: 180, channels: 3, background: "#ef7d32" }
    }).png().toBuffer(), left: 110, top: 60 }]).png().toBuffer();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(productImage), {
      status: 200,
      headers: { "Content-Type": "image/png" }
    })));
    const qrDataUrl = `data:image/png;base64,${productImage.toString("base64")}`;

    const bytes = await renderMenuPdf({
      restaurant,
      categories: [category],
      items: [item],
      optionCatalog: { groups: [], options: [], links: [] },
      menuUrl: "https://example.com/r/print-cafe",
      qrDataUrl,
      settings
    });

    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF");
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(3);
    expect(document.getTitle()).toBe("Print Cafe menu");

    if (process.env.WHATSORDER_PDF_TEST_OUTPUT) {
      await mkdir("tmp/pdfs", { recursive: true });
      await writeFile(process.env.WHATSORDER_PDF_TEST_OUTPUT, bytes);
    }
  }, 30_000);
});
