import { BillingSoftBlock } from "@/components/admin/BillingSoftBlock";
import { MarketingTabs } from "@/components/admin/MarketingTabs";
import { PromoCodesManager } from "@/components/admin/PromoCodesManager";
import { isManagementBlocked } from "@/lib/billing";
import { getTenantAccess } from "@/lib/billing-data";
import { listPromoCodes } from "@/lib/promo-code-data";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

export const dynamic = "force-dynamic";

// Promo codes customers can enter at the menu-link checkout.
export default async function PromoCodesPage() {
  const { restaurant } = await requireRestaurantRole(["restaurant_admin", "owner", "manager"]);
  const access = await getTenantAccess(restaurant.id);
  if (isManagementBlocked(access.access)) {
    return <BillingSoftBlock surface="Promo codes" />;
  }
  const codes = await listPromoCodes(restaurant.id);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <MarketingTabs active="promo" />
      <h1 className="mt-4 text-2xl font-black text-ink">Promo codes</h1>
      <p className="mt-1 text-sm text-stone-600">
        Customers enter a code at checkout on your menu link. The discount comes off the items, never the delivery fee.
      </p>
      <div className="mt-6">
        <PromoCodesManager codes={codes} restaurant={restaurant} />
      </div>
    </main>
  );
}
