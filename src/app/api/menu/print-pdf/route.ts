import { NextResponse } from "next/server";
import { getMenu, getMenuOptionCatalog } from "@/lib/data";
import { parseMenuPrintPdfSettings } from "@/lib/menu-pdf-config";
import { renderMenuPdf } from "@/lib/menu-pdf/render";
import { resolveRestaurantAdminSession } from "@/lib/super-admin-auth";
import { getStoreShareAssets } from "@/lib/store-share-assets";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const resolution = await resolveRestaurantAdminSession();
  if (!resolution.session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let settings;
  try {
    settings = parseMenuPrintPdfSettings(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!settings) {
    return NextResponse.json({ error: "Invalid print settings." }, { status: 400 });
  }

  const { restaurant, restaurantId } = resolution.session;
  try {
    const [menu, optionCatalog, shareAssets] = await Promise.all([
      getMenu(restaurantId, { admin: true }),
      getMenuOptionCatalog(restaurantId, { admin: true }),
      getStoreShareAssets(restaurant.slug)
    ]);
    const pdf = await renderMenuPdf({
      restaurant,
      categories: menu.categories,
      items: menu.items,
      optionCatalog,
      menuUrl: shareAssets.menuUrl,
      qrDataUrl: shareAssets.qrDataUrl,
      settings
    });
    const safeSlug = restaurant.slug.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    return new Response(Buffer.from(pdf), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${safeSlug}-menu.pdf"`,
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "MENU_PDF_FAILED";
    console.error("WhatsOrder menu PDF generation failed", { restaurantId, code });
    if (code === "MENU_PDF_EMPTY") {
      return NextResponse.json({ error: "There are no available menu items to print." }, { status: 422 });
    }
    if (code === "MENU_PDF_TOO_MANY_ITEMS") {
      return NextResponse.json({ error: "This menu is too large for one PDF." }, { status: 413 });
    }
    return NextResponse.json(
      { error: "The PDF could not be generated. Please try again." },
      { status: 500 }
    );
  }
}
