// Pure helpers for option-aware cart lines, shared by the customer cart,
// staff punch screen, and server-side rendering (WhatsApp text, tickets).
//
// A line's identity is (item_id, offer_id, selected option ids): the same
// item can legitimately sit in the cart twice with different configurations
// (Small karak + Large karak). The key is derived, never persisted — order
// rows store only the CartLine fields, and parseAndValidateCart's whitelist
// would strip anything else anyway.

import type { CustomerLanguage } from "@/lib/customer-i18n";
import type { CartLine, CartLineOption, OrderItem } from "@/lib/types";

export function cartLineKey(
  line: Pick<CartLine, "item_id" | "offer_id" | "options">
): string {
  const optionIds = (line.options ?? []).map((option) => option.option_id).sort();
  // UUIDs never contain "|", so the join is collision-free. Legacy lines
  // (no offer, no options) reduce to "<item_id>|" — the same dedupe behavior
  // as the old item_id-only keying.
  return [line.item_id, line.offer_id ?? "", ...optionIds].join("|");
}

/** "Large, No sugar" — Arabic names when asked for, English fallback. */
export function formatLineOptions(
  options: CartLineOption[] | undefined,
  language: CustomerLanguage = "en"
): string | null {
  if (!options || options.length === 0) {
    return null;
  }

  return options
    .map((option) =>
      language === "ar" && option.name_ar ? option.name_ar : option.name
    )
    .join(", ");
}

/** "Karak (Large, No sugar)" — used by the WhatsApp message, order lists, and tickets. */
export function formatOrderItemName(
  item: Pick<OrderItem, "name" | "name_ar" | "options">,
  language: CustomerLanguage = "en"
): string {
  const baseName = language === "ar" && item.name_ar ? item.name_ar : item.name;
  const optionsText = formatLineOptions(item.options, language);
  return optionsText ? `${baseName} (${optionsText})` : baseName;
}

/** Unit price for a configuration: base (or offer promo) + option deltas, never negative. */
export function configuredUnitPrice(
  basePrice: number,
  options: CartLineOption[] | undefined
): number {
  const deltaSum = (options ?? []).reduce(
    (sum, option) => sum + Number(option.price_delta),
    0
  );
  return Math.max(0, Number(basePrice) + deltaSum);
}
