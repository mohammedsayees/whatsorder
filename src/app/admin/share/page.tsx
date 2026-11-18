import { MarketingTabs } from "@/components/admin/MarketingTabs";
import { StoreShareKit } from "@/components/admin/StoreShareKit";
import { getStoreOrderSourceSummary } from "@/lib/store-order-sources";
import { getStoreShareAssets } from "@/lib/store-share-assets";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

export default async function StoreSharePage() {
  const { restaurant } = await requireRestaurantRole([
    "owner",
    "restaurant_admin",
    "manager"
  ]);
  const [assets, sourceSummary] = await Promise.all([
    getStoreShareAssets(restaurant.slug),
    getStoreOrderSourceSummary(restaurant.id)
  ]);

  return (
    <>
      <div className="mx-auto max-w-5xl px-4 pt-6 lg:px-8">
        <MarketingTabs active="share" />
      </div>
      <StoreShareKit
        linkUrl={assets.linkUrl}
        menuUrl={assets.menuUrl}
        qrDataUrl={assets.qrDataUrl}
        restaurantId={restaurant.id}
        restaurantName={restaurant.name}
        restaurantSlug={restaurant.slug}
        sourceSummary={sourceSummary}
        whatsappShareUrl={assets.whatsappShareUrl}
      />
    </>
  );
}
