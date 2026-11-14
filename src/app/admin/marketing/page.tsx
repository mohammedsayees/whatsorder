import { MarketingTabs } from "@/components/admin/MarketingTabs";
import { PosterStudio } from "@/components/admin/PosterStudio";
import { formatCurrency } from "@/lib/currency";
import { getMenuOffers } from "@/lib/data";
import { isOfferOrderable } from "@/lib/order-pricing";
import { buildPosterCaption, posterStoreLink } from "@/lib/poster/caption";
import {
  getMarketingAudience,
  getPosterHistory,
  getPosterPerformance
} from "@/lib/poster/store";
import { publicAppUrl } from "@/lib/public-app-url";
import { festivalsForCountry } from "@/lib/poster/festivals";
import { posterLanguageAllowed } from "@/lib/poster/language";
import {
  DEFAULT_POSTER_THEME,
  POSTER_THEMES,
  POSTER_THEME_IDS,
  isPosterThemeId
} from "@/lib/poster/themes";
import { requirePlanFeature } from "@/lib/plan-gates";
import { requireRestaurantRole } from "@/lib/super-admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { MenuItem } from "@/lib/types";
import { posterSendAvailability } from "@/lib/marketing/send-availability";

export const dynamic = "force-dynamic";
// The poster send action runs inside this page's request; its loop keeps a
// 40 s budget (lib/marketing/send-pipeline.ts) under this ceiling.
export const maxDuration = 60;

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

async function getNewItemOptions(
  restaurantId: string,
  restaurant: Parameters<typeof formatCurrency>[1]
): Promise<BestsellerOption[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const { data, error } = await admin
    .from("menu_items")
    .select("id, name, price, image_url")
    .eq("restaurant_id", restaurantId)
    .eq("is_available", true)
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) {
    console.error("WhatsOrder poster: new items read failed", error.code);
    return [];
  }
  return ((data ?? []) as Pick<MenuItem, "id" | "name" | "price" | "image_url">[]).map((item) => ({
    menuItemId: item.id,
    name: item.name,
    priceLabel: formatCurrency(item.price, restaurant),
    soldQty: null,
    hasPhoto: Boolean(item.image_url)
  }));
}

export default async function MarketingPage() {
  const session = await requireRestaurantRole([
    "restaurant_admin",
    "owner",
    "manager"
  ]);
  await requirePlanFeature(session.restaurantId, "campaigns");

  const [bestsellers, newItems, allOffers, history, sendAvailability] = await Promise.all([
    getBestsellerOptions(session.restaurantId, session.restaurant),
    getNewItemOptions(session.restaurantId, session.restaurant),
    getMenuOffers(session.restaurantId, { admin: true }),
    getPosterHistory(session.restaurantId),
    posterSendAvailability(session.restaurantId)
  ]);
  const ownsCloudNumber = sendAvailability.ok;
  // Only the owner of the shared Cloud number can send at all; skip the
  // audience reads otherwise.
  const audience = ownsCloudNumber
    ? await getMarketingAudience(session.restaurantId)
    : { recipients: [], frequencyCapped: 0 };

  const performance = await getPosterPerformance(
    session.restaurantId,
    history.map((entry) => entry.id)
  );
  const appUrl = publicAppUrl();

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
      <MarketingTabs active="posters" />
      <h1 className="mt-4 text-2xl font-black text-ink">Marketing</h1>
      <p className="mt-1 text-sm text-stone-600">
        Turn your menu into ready-to-post WhatsApp posters — no design work.
      </p>
      <PosterStudio
        bestsellers={bestsellers}
        newItems={newItems}
        loyalty={{
          enabled: session.restaurant.loyalty_enabled !== false,
          summary: `Collect ${session.restaurant.loyalty_stamps_required ?? 10} stamps, get ${
            session.restaurant.loyalty_reward_description?.trim() || "a free treat"
          }`
        }}
        festivals={festivalsForCountry(session.restaurant.country_code).map((festival) => ({
          id: festival.id,
          label: festival.label,
          greeting: festival.greeting
        }))}
        arabicAllowed={posterLanguageAllowed(session.restaurant)}
        eligibleCount={audience.recipients.length}
        defaultThemeId={
          isPosterThemeId(session.restaurant.poster_theme)
            ? session.restaurant.poster_theme
            : DEFAULT_POSTER_THEME
        }
        themeLabels={Object.fromEntries(POSTER_THEME_IDS.map((id) => [id, POSTER_THEMES[id].label]))}
        frequencyCappedCount={audience.frequencyCapped}
        sendBlockedReason={sendAvailability.ok ? null : sendAvailability.reason}
        history={history.map((entry) => ({
          id: entry.id,
          templateId: entry.template_id,
          status: entry.status,
          createdAt: entry.created_at,
          previewUrl: entry.previewUrl,
          downloadUrl: entry.downloadUrl,
          headline: entry.copy?.headline ?? "",
          caption: entry.copy?.caption ?? "",
          shareCaption: buildPosterCaption(entry.copy?.caption, {
            storeLink: posterStoreLink(appUrl, session.restaurant.slug, entry.id)
          }),
          format: entry.copy?.format ?? "story",
          sentCount: performance.get(entry.id)?.sentCount ?? 0,
          orderCount: performance.get(entry.id)?.orderCount ?? 0
        }))}
        offers={offers}
      />
    </main>
  );
}
