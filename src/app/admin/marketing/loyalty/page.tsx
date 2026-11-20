import { BillingSoftBlock } from "@/components/admin/BillingSoftBlock";
import { LoyaltySettingsForm } from "@/components/admin/LoyaltySettingsForm";
import { MarketingTabs } from "@/components/admin/MarketingTabs";
import { isManagementBlocked } from "@/lib/billing";
import { getTenantAccess } from "@/lib/billing-data";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

export default async function MarketingLoyaltyPage() {
  const { restaurant, restaurantId } = await requireRestaurantRole(["owner", "restaurant_admin"]);
  const access = await getTenantAccess(restaurantId);
  if (isManagementBlocked(access.access)) {
    return <BillingSoftBlock surface="Loyalty" />;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <MarketingTabs active="loyalty" canEditLoyalty />
      <h1 className="mt-4 text-2xl font-black text-ink">Loyalty stamp card</h1>
      <div className="mt-6">
        <LoyaltySettingsForm restaurant={restaurant} canWrite={Boolean(getSupabaseAdmin())} />
      </div>
    </main>
  );
}
