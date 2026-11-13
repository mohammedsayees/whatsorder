import { StoreShareKit } from "@/components/admin/StoreShareKit";
import { getStoreShareAssets } from "@/lib/store-share-assets";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

export default async function StoreSharePage() {
  const { restaurant } = await requireRestaurantRole([
    "owner",
    "restaurant_admin",
    "manager"
  ]);
  const assets = await getStoreShareAssets(restaurant.slug);

  return (
    <StoreShareKit
      menuUrl={assets.menuUrl}
      qrDataUrl={assets.qrDataUrl}
      restaurantId={restaurant.id}
      restaurantName={restaurant.name}
      restaurantSlug={restaurant.slug}
    />
  );
}
