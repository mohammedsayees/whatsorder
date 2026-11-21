import { notFound } from "next/navigation";
import { MenuPrintDesigner } from "@/components/admin/MenuPrintDesigner";
import { STORE_SHARE_SOURCES } from "@/lib/attribution";
import { getMenu, getMenuOptionCatalog } from "@/lib/data";
import { getStoreShareAssets } from "@/lib/store-share-assets";
import { requireSuperAdmin } from "@/lib/super-admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Restaurant } from "@/lib/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Super-admin twin of /admin/menu/print, scoped to the restaurant in the URL.
export default async function SuperAdminMenuPrintPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  if (!supabase || !UUID_PATTERN.test(id)) {
    notFound();
  }

  const { data } = await supabase.from("restaurants").select("*").eq("id", id).maybeSingle();
  if (!data) {
    notFound();
  }
  const restaurant = data as Restaurant;

  const [menu, optionCatalog, shareAssets] = await Promise.all([
    getMenu(restaurant.id, { admin: true }),
    getMenuOptionCatalog(restaurant.id, { admin: true }),
    getStoreShareAssets(restaurant.slug, { qrSource: STORE_SHARE_SOURCES.printedMenu })
  ]);

  return (
    <MenuPrintDesigner
      backHref={`/super-admin/restaurants/${restaurant.id}?tab=menu`}
      categories={menu.categories}
      items={menu.items}
      menuUrl={shareAssets.menuUrl}
      optionCatalog={optionCatalog}
      qrDataUrl={shareAssets.qrDataUrl}
      restaurant={restaurant}
      superAdminRestaurantId={restaurant.id}
    />
  );
}
