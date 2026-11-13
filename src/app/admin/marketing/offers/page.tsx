import { BillingSoftBlock } from "@/components/admin/BillingSoftBlock";
import { MarketingTabs } from "@/components/admin/MarketingTabs";
import { OffersManager } from "@/components/admin/OffersManager";
import { isManagementBlocked } from "@/lib/billing";
import { getTenantAccess } from "@/lib/billing-data";
import { getMenu, getMenuOffers } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

// Offers inside the Marketing section. Same OffersManager (and the same
// server actions) as the Menu page, so both stay in step.
export default async function MarketingOffersPage() {
  const { restaurant } = await requireRestaurantRole(["restaurant_admin", "owner", "manager"]);
  const access = await getTenantAccess(restaurant.id);
  if (isManagementBlocked(access.access)) {
    return <BillingSoftBlock surface="Offers" />;
  }
  const [menu, offers] = await Promise.all([
    getMenu(restaurant.id, { admin: true }),
    getMenuOffers(restaurant.id, { admin: true })
  ]);
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <MarketingTabs active="offers" />
      <h1 className="mt-4 text-2xl font-black text-ink">Offers</h1>
      <p className="mt-1 text-sm text-stone-600">
        Active offers show on your menu and can be turned into posters.
      </p>
      <div className="mt-6">
        <OffersManager canWrite={Boolean(getSupabaseAdmin())} items={menu.items} offers={offers} restaurant={restaurant} />
      </div>
    </main>
  );
}
