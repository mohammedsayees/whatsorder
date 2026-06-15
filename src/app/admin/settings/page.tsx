import { SettingsForm } from "@/components/admin/SettingsForm";
import { getDefaultRestaurant } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";

export default async function AdminSettingsPage() {
  const restaurant = await getDefaultRestaurant();
  const canWrite = Boolean(getSupabaseAdmin());

  if (!restaurant) {
    return null;
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-black">Restaurant settings</h1>
      <p className="mt-2 text-stone-600">
        Configure public menu details and the WhatsApp number used for click-to-order.
      </p>
      {!canWrite ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          Demo mode is read-only. Connect Supabase in .env.local to save settings.
        </p>
      ) : null}
      <div className="mt-6">
        <SettingsForm restaurant={restaurant} canWrite={canWrite} />
      </div>
    </main>
  );
}
