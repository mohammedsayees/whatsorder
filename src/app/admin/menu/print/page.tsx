import { MenuPrintDesigner } from "@/components/admin/MenuPrintDesigner";
import { getMenu } from "@/lib/data";
import { getStoreShareAssets } from "@/lib/store-share-assets";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

export default async function PrintMenuPage() {
  const { restaurant } = await requireRestaurantAdmin();
  const menu = await getMenu(restaurant.id, { admin: true });
  const { menuUrl, qrDataUrl } = await getStoreShareAssets(restaurant.slug);

  return (
    <MenuPrintDesigner
      categories={menu.categories}
      items={menu.items}
      menuUrl={menuUrl}
      qrDataUrl={qrDataUrl}
      restaurant={restaurant}
    />
  );
}
