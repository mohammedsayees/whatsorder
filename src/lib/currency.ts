import { getRestaurantLocalization } from "@/lib/localization";
import type { RestaurantLocalization } from "@/lib/types";

export function formatCurrency(
  value: number,
  restaurant?: Partial<RestaurantLocalization> | null
) {
  const localization = getRestaurantLocalization(restaurant);

  return new Intl.NumberFormat(localization.locale, {
    style: "currency",
    currency: localization.currency_code,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
}

// Platform subscription billing remains UAE-based. Restaurant-order surfaces
// should call formatCurrency with that restaurant's localization profile.
export function formatAED(value: number) {
  return formatCurrency(value);
}
