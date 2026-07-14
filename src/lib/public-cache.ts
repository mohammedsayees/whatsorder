// Cache tags for the public customer path (/r/[slug]).
//
// The menu page is forced dynamic by the customer-session cookie read, so
// without a data cache every menu open re-queries restaurant + menu + offers
// + feedback. These reads only change on admin edits, which already call
// revalidatePath — the same call sites now revalidate these tags. The TTL is
// a safety net so a missed invalidation heals on its own.

import { revalidateTag } from "next/cache";

export const PUBLIC_CACHE_TTL_SECONDS = 300;

export function publicRestaurantTag(slug: string) {
  return `public-restaurant:${slug}`;
}

export function publicMenuTag(restaurantId: string) {
  return `public-menu:${restaurantId}`;
}

export function publicFeedbackTag(restaurantId: string) {
  return `public-feedback:${restaurantId}`;
}

/** Invalidate every cached public read for one restaurant. Call from server
 * actions whenever restaurant settings, menu, offers, or feedback change. */
export function revalidatePublicRestaurantCache(restaurant: {
  id: string;
  slug: string;
}) {
  revalidateTag(publicRestaurantTag(restaurant.slug));
  revalidateTag(publicMenuTag(restaurant.id));
  revalidateTag(publicFeedbackTag(restaurant.id));
}
