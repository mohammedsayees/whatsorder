import { MenuPrintDesigner } from "@/components/admin/MenuPrintDesigner";
import { getMenu, getMenuOptionCatalog } from "@/lib/data";
import { getStoreShareAssets } from "@/lib/store-share-assets";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

export default async function PrintMenuPage() {
  const { restaurant } = await requireRestaurantAdmin();
  const [menu, optionCatalog, shareAssets] = await Promise.all([
    getMenu(restaurant.id, { admin: true }),
    getMenuOptionCatalog(restaurant.id, { admin: true }),
    getStoreShareAssets(restaurant.slug)
  ]);

  return (
    <MenuPrintDesigner
      categories={menu.categories}
      items={menu.items}
      menuUrl={shareAssets.menuUrl}
      optionCatalog={optionCatalog}
      qrDataUrl={shareAssets.qrDataUrl}
      restaurant={restaurant}
    />
  );
}
