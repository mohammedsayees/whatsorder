import { MenuManager } from "@/components/admin/MenuManager";
import { getMenu, getDefaultRestaurant } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";

export default async function AdminMenuPage() {
  const restaurant = await getDefaultRestaurant();

  if (!restaurant) {
    return null;
  }

  const menu = await getMenu(restaurant.id, { admin: true });
  const canWrite = Boolean(getSupabaseAdmin());

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-black">Menu management</h1>
      <p className="mt-2 text-stone-600">
        Add items, edit prices, and mark items unavailable when the kitchen runs out.
      </p>
      {!canWrite ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          Demo mode is read-only. Connect Supabase in .env.local to enable menu writes.
        </p>
      ) : null}
      <div className="mt-6">
        <MenuManager categories={menu.categories} items={menu.items} canWrite={canWrite} />
      </div>
    </main>
  );
}
