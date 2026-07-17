import { PosterStudio } from "@/components/admin/PosterStudio";
import { formatCurrency } from "@/lib/currency";
import { getMenuOffers } from "@/lib/data";
import { isOfferOrderable } from "@/lib/order-pricing";
import { getInWindowRecipients, getPosterHistory } from "@/lib/poster/store";
import { requireRestaurantRole } from "@/lib/super-admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { MenuItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export type BestsellerOption = {
  menuItemId: string;
  name: string;
  priceLabel: string;
  soldQty: number | null;
  hasPhoto: boolean;
};

export type OfferOption = {
  offerId: string;
  title: string;
  priceLabel: string;
  originalPriceLabel: string | null;
};

async function getBestsellerOptions(
  restaurantId: string,
  restaurant: Parameters<typeof formatCurrency>[1]
): Promise<BestsellerOption[]> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return [];
  }

  const { data: rows, error } = await admin.rpc("get_bestsellers", {
    rid: restaurantId,
    window_days: 30,
    limit_n: 6
  });
  if (error || !Array.isArray(rows) || rows.length === 0) {
    if (error) {
      console.error("WhatsOrder poster: get_bestsellers failed", error.code);
    }
    return [];
  }
  const ranked = rows as { menu_item_id: string; qty: number | string }[];

  const { data: items } = await admin
    .from("menu_items")
    .select("id, name, price, image_url")
    .eq("restaurant_id", restaurantId)
    .in(
      "id",
      ranked.map((row) => row.menu_item_id)
    );
  const itemsById = new Map(
    ((items ?? []) as Pick<MenuItem, "id" | "name" | "price" | "image_url">[]).map(
      (item) => [item.id, item]
    )
  );

  return ranked
    .map((row) => {
      const item = itemsById.get(row.menu_item_id);
      if (!item) {
        return null;
      }
      const qty = Math.floor(Number(row.qty));
      return {
        menuItemId: item.id,
        name: item.name,
        priceLabel: formatCurrency(item.price, restaurant),
        soldQty: Number.isFinite(qty) && qty > 0 ? qty : null,
        hasPhoto: Boolean(item.image_url)
      };
    })
    .filter((option): option is BestsellerOption => option !== null);
}

export default async function MarketingPage() {
  const session = await requireRestaurantRole([
    "restaurant_admin",
    "owner",
    "manager"
  ]);

  const [bestsellers, allOffers, history, recipients] = await Promise.all([
    getBestsellerOptions(session.restaurantId, session.restaurant),
    getMenuOffers(session.restaurantId, { admin: true }),
    getPosterHistory(session.restaurantId),
    getInWindowRecipients(session.restaurantId)
  ]);

  const offers: OfferOption[] = allOffers
    .filter((offer) => isOfferOrderable(offer))
    .map((offer) => ({
      offerId: offer.id,
      title: offer.title,
      priceLabel: formatCurrency(offer.promotional_price, session.restaurant),
      originalPriceLabel: null
    }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 lg:px-8">
      <h1 className="text-2xl font-black text-ink">Marketing</h1>
      <p className="mt-1 text-sm text-stone-600">
        Turn your menu into ready-to-post WhatsApp posters — no design work.
      </p>
      <PosterStudio
        bestsellers={bestsellers}
        eligibleCount={recipients.length}
        history={history.map((entry) => ({
          id: entry.id,
          templateId: entry.template_id,
          status: entry.status,
          createdAt: entry.created_at,
          previewUrl: entry.previewUrl,
          downloadUrl: entry.downloadUrl,
          caption: entry.copy?.caption ?? ""
        }))}
        offers={offers}
      />
    </main>
  );
}
