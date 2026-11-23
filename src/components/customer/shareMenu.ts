// Share-button flow for the café menu page. Loaded on tap only (dynamic import
// from RestaurantMenu) so none of it counts toward the customer first-load bundle.

import { getShareReferralAction } from "@/app/r/[restaurantSlug]/referral-actions";
import type { CustomerLanguage } from "@/lib/customer-i18n";
import { buildShareMessage, buildShareUrl } from "@/lib/share-message";
import type { PublicRestaurant } from "@/lib/types";

export async function shareMenu({
  restaurant,
  restaurantName,
  language,
  offers
}: {
  restaurant: Parameters<typeof buildShareMessage>[0]["restaurant"] & Pick<PublicRestaurant, "slug">;
  restaurantName: string;
  language: CustomerLanguage;
  offers: Parameters<typeof buildShareMessage>[0]["offers"];
}): Promise<void> {
  try {
    // A signed-in customer shares their personal referral link (null when signed
    // out, never ordered, or the café has referrals off: the plain link is used).
    const referral = await getShareReferralAction(restaurant.slug).catch(() => null);
    // The link is part of the text so the message reads in order
    // (pitch, offer, bonus, call to action, link, WhatsOrder credit).
    const message = buildShareMessage({
      restaurant,
      language,
      offers,
      bonusPoints: referral?.pointsEach,
      url: buildShareUrl(window.location.href, referral?.code)
    });

    if (navigator.share) {
      await navigator.share({ title: restaurantName, text: message });
      return;
    }

    await navigator.clipboard.writeText(message);
  } catch {
    // Dismissed share sheet or blocked clipboard: nothing to do.
  }
}
