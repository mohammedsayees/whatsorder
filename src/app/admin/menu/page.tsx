import { MenuManager } from "@/components/admin/MenuManager";
import { OffersManager } from "@/components/admin/OffersManager";
import { getMenu, getMenuOffers } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

export default async function AdminMenuPage() {
  const { restaurant, role } = await requireRestaurantAdmin();

  const [menu, offers] = await Promise.all([
    getMenu(restaurant.id, { admin: true }),
    getMenuOffers(restaurant.id, { admin: true })
  ]);
  const hasDatabaseAccess = Boolean(getSupabaseAdmin());
  const canWrite =
    hasDatabaseAccess && ["restaurant_admin", "owner", "manager"].includes(role);
  const canManageOffers =
    canWrite;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-black">Menu management</h1>
      <p className="mt-2 text-stone-600">
        Add items, edit prices, tag Best Sellers, and mark items unavailable when the kitchen runs out.
      </p>
      {!hasDatabaseAccess ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          Demo mode is read-only. Connect Supabase in .env.local to enable menu writes.
        </p>
      ) : role === "staff" ? (
        <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
          Staff accounts can view the menu but only managers and owners can change menu content.
        </p>
      ) : null}
      <div className="mt-6">
        <OffersManager
          canWrite={canManageOffers}
          items={menu.items}
          offers={offers}
        />
      </div>
      <div className="mt-6">
        <MenuManager categories={menu.categories} items={menu.items} canWrite={canWrite} restaurantSlug={restaurant.slug} />
      </div>
    </main>
  );
}
