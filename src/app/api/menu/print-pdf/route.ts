import { NextResponse } from "next/server";
import { getMenu, getMenuOptionCatalog } from "@/lib/data";
import { parseMenuPrintPdfSettings } from "@/lib/menu-pdf-config";
import { renderMenuPdf } from "@/lib/menu-pdf/render";
import {
  getSuperAdminSession,
  resolveRestaurantAdminSession,
  splitRestaurantForStaff,
  type StaffVisibleRestaurant
} from "@/lib/super-admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Restaurant } from "@/lib/types";
import { STORE_SHARE_SOURCES } from "@/lib/attribution";
import { getStoreShareAssets } from "@/lib/store-share-assets";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Owners/managers print their own session restaurant. A super admin passes
// ?restaurant_id= (from /super-admin/restaurants/[id]/menu-print) and must
// hold a verified super_admin profile; nobody else can pick a restaurant.
type PrintTarget =
  | { ok: false; response: NextResponse }
  | { ok: true; restaurantId: string; restaurant: StaffVisibleRestaurant };

async function resolvePrintTarget(request: Request): Promise<PrintTarget> {
  const requestedId = new URL(request.url).searchParams.get("restaurant_id")?.trim();
  if (requestedId) {
    if (!UUID_PATTERN.test(requestedId)) {
      return { ok: false, response: NextResponse.json({ error: "Invalid restaurant." }, { status: 400 }) };
    }
    const superAdmin = await getSuperAdminSession();
    const supabase = getSupabaseAdmin();
    if (!superAdmin || !supabase) {
      return { ok: false, response: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
    }
    const { data } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", requestedId)
      .maybeSingle();
    if (!data) {
      return { ok: false, response: NextResponse.json({ error: "Restaurant not found." }, { status: 404 }) };
    }
    return {
      ok: true,
      restaurantId: requestedId,
      restaurant: splitRestaurantForStaff(data as Restaurant).restaurant
    };
  }

  const resolution = await resolveRestaurantAdminSession();
  if (!resolution.session) {
    return { ok: false, response: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  }
  return {
    ok: true,
    restaurantId: resolution.session.restaurantId,
    restaurant: resolution.session.restaurant
  };
}

export async function POST(request: Request) {
  const target = await resolvePrintTarget(request);
  if (!target.ok) {
    return target.response;
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

  const { restaurant, restaurantId } = target;
  try {
    const [menu, optionCatalog, shareAssets] = await Promise.all([
      getMenu(restaurantId, { admin: true }),
      getMenuOptionCatalog(restaurantId, { admin: true }),
      getStoreShareAssets(restaurant.slug, { qrSource: STORE_SHARE_SOURCES.printedMenu })
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
