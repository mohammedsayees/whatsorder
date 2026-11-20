import { BillingSoftBlock } from "@/components/admin/BillingSoftBlock";
import { MarketingTabs } from "@/components/admin/MarketingTabs";
import { PosterBrandingForm, type PosterBrandingSample } from "@/components/admin/PosterBrandingForm";
import { isManagementBlocked } from "@/lib/billing";
import { getTenantAccess } from "@/lib/billing-data";
import { formatCurrency } from "@/lib/currency";
import { previewPosterPalette } from "@/lib/poster/subjects";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantRole } from "@/lib/super-admin-auth";
import type { MenuItem } from "@/lib/types";

export const dynamic = "force-dynamic";

/** A real dish for the preview posters (this restaurant's only), else a placeholder. */
async function getPreviewSample(
  restaurantId: string,
  restaurant: Parameters<typeof formatCurrency>[1]
): Promise<PosterBrandingSample> {
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data } = await admin
      .from("menu_items")
      .select("name, price")
      .eq("restaurant_id", restaurantId)
      .eq("is_available", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const item = data as Pick<MenuItem, "name" | "price"> | null;
    if (item?.name) {
      return { name: item.name, priceLabel: formatCurrency(item.price, restaurant) };
    }
  }
  return { name: "Your dish", priceLabel: null };
}

export default async function MarketingBrandPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const query = await searchParams;
  const session = await requireRestaurantRole(["restaurant_admin", "owner", "manager"]);
  const { restaurant, restaurantId } = session;
  const canEditLoyalty = session.role === "owner" || session.role === "restaurant_admin";
  const [access, fromLogo, sample] = await Promise.all([
    getTenantAccess(restaurantId),
    // The logo's palette on its own, so switching back to "Use my logo's
    // colour" previews correctly even while a custom colour is saved.
    previewPosterPalette({ poster_brand_color: null, logo_url: restaurant.logo_url }),
    getPreviewSample(restaurantId, restaurant)
  ]);
  if (isManagementBlocked(access.access)) {
    return <BillingSoftBlock surface="Brand look" />;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <MarketingTabs active="brand" canEditLoyalty={canEditLoyalty} />
      <h1 className="mt-4 text-2xl font-black text-ink">Brand look</h1>
      <div className="mt-6 max-w-3xl">
        <PosterBrandingForm
          brandColor={restaurant.poster_brand_color ?? null}
          canWrite={Boolean(getSupabaseAdmin())}
          failed={query.error === "1"}
          hasLogoColour={fromLogo.source === "logo"}
          logoPalette={fromLogo.palette}
          restaurantName={restaurant.name}
          sample={sample}
          saved={query.saved === "1"}
          theme={restaurant.poster_theme ?? null}
        />
      </div>
    </main>
  );
}
