// lib/poster/language.ts
//
// Whether a restaurant may make Arabic posters. There is no explicit
// "customer languages" setting, so Arabic is offered when the restaurant is in
// the UAE or has Arabic details (name / subtitle / address) filled in.

import { getRestaurantLocalization } from "@/lib/localization";
import type { Restaurant } from "@/lib/types";

export function posterLanguageAllowed(
  restaurant: Pick<Restaurant, "name_ar" | "subtitle_ar" | "address_ar"> & Partial<Pick<Restaurant, "country_code">>
): boolean {
  return (
    getRestaurantLocalization(restaurant).country_code === "AE" ||
    Boolean(restaurant.name_ar?.trim() || restaurant.subtitle_ar?.trim() || restaurant.address_ar?.trim())
  );
}
