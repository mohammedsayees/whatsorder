import { formatCurrency } from "@/lib/currency";
import type { CustomerLanguage } from "@/lib/customer-i18n";
import { referralSource } from "@/lib/referrals";
import type { PublicRestaurant } from "@/lib/types";

type ShareOffer = {
  title: string;
  title_ar?: string | null;
  promotional_price: number;
};

const copy = {
  en: {
    pitch: "Order directly from the restaurant. No app to download, straight to your door.",
    freeDelivery: "Free delivery",
    bonus: (points: number) => `🎁 Get ${points} bonus points on your first order`,
    cta: "Order here 👇",
    poweredBy: "Powered by WhatsOrder"
  },
  ar: {
    pitch: "اطلب مباشرة من المطعم. بدون تحميل أي تطبيق، والتوصيل لباب بيتك.",
    freeDelivery: "توصيل مجاني",
    bonus: (points: number) => `🎁 احصل على ${points} نقطة مكافأة على أول طلب لك`,
    cta: "اطلب من هنا 👇",
    poweredBy: "بدعم من WhatsOrder"
  }
} as const;

/**
 * Link to share: the café's own menu page, without the sender's transient
 * query (table number, fulfilment…). The `src` tag tells shared visits apart
 * from direct ones; a signed-in sender's referral code makes it `ref-<code>`,
 * which is how the friend's first order is credited back to the sender.
 */
export function buildShareUrl(pageUrl: string, referralCode?: string | null): string {
  const url = new URL(pageUrl);
  return `${url.origin}${url.pathname}?src=${referralSource(referralCode) ?? "share"}`;
}

/** Prefilled, language-aware text for the native share sheet / WhatsApp. */
export function buildShareMessage({
  restaurant,
  language,
  offers,
  bonusPoints,
  url
}: {
  restaurant: Pick<
    PublicRestaurant,
    "name" | "name_ar" | "address" | "address_ar" | "delivery_fee" | "currency_code" | "locale"
  >;
  language: CustomerLanguage;
  /** Offers currently on sale (already filtered to available items). */
  offers: ShareOffer[];
  /** Points the friend earns on their first order (only with a referral link). */
  bonusPoints?: number | null;
  url: string;
}): string {
  const c = copy[language];
  const ar = language === "ar";
  const name = ar && restaurant.name_ar ? restaurant.name_ar : restaurant.name;
  const address = ar && restaurant.address_ar ? restaurant.address_ar : restaurant.address;
  const area = address?.split(",").slice(0, 2).join(",").trim();

  const offer = offers[0];
  const offerLine = offer
    ? `🎁 ${ar && offer.title_ar ? offer.title_ar : offer.title} · ${formatCurrency(offer.promotional_price, restaurant)}`
    : restaurant.delivery_fee === 0
      ? `🚚 ${c.freeDelivery}`
      : null;

  return [
    `🍽️ ${area ? `${name} – ${area}` : name}`,
    c.pitch,
    offerLine,
    bonusPoints ? c.bonus(bonusPoints) : null,
    "",
    c.cta,
    url,
    "",
    c.poweredBy
  ]
    .filter((line) => line !== null)
    .join("\n");
}
