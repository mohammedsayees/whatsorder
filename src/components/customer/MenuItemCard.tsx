"use client";
import Image from "next/image";
import { memo } from "react";
import { Star, Plus, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { customerTranslations, type CustomerLanguage } from "@/lib/customer-i18n";
import { cartLineKey } from "@/lib/cart-line";
import type { CartLine, CustomerMenuItem, CustomerMenuOffer, PublicRestaurant } from "@/lib/types";

export function isOptimizableImageUrl(url: string) {
  try {
    return new URL(url).hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

type MenuItemCardProps = {
  item: CustomerMenuItem;
  activeOffer: CustomerMenuOffer | null;
  hasOptions: boolean;
  /** The plain (option-less) cart line for this item, if any. */
  cartLine: CartLine | undefined;
  /** Aggregate quantity across every cart line of this item. */
  totalQuantity: number;
  /** Aggregate quantity across every cart line of the active offer. */
  offerQuantity: number;
  /** Lowest configured price when options change it ("from AED X"); else null. */
  fromPrice?: number | null;
  orderingAvailable: boolean;
  language: CustomerLanguage;
  restaurant: PublicRestaurant;
  onAddItem: (item: CustomerMenuItem) => void;
  onAddOffer: (item: CustomerMenuItem, offer: CustomerMenuOffer) => void;
  onIncrement: (lineKey: string) => void;
  onIncrementOffer: (lineKey: string, offer: CustomerMenuOffer) => void;
  onDecrement: (lineKey: string) => void;
  onOpenOptions: (item: CustomerMenuItem, offer: CustomerMenuOffer | null) => void;
};

// Memoized so a cart tap only re-renders the card whose quantity changed —
// every prop of an unaffected card keeps its identity across cart updates.
export const MenuItemCard = memo(function MenuItemCard({
  item,
  activeOffer,
  hasOptions,
  cartLine,
  totalQuantity,
  offerQuantity,
  fromPrice = null,
  orderingAvailable,
  language,
  restaurant,
  onAddItem,
  onAddOffer,
  onIncrement,
  onIncrementOffer,
  onDecrement,
  onOpenOptions
}: MenuItemCardProps) {
  const t = customerTranslations[language];
  const plainLineKey = activeOffer
    ? cartLineKey({ item_id: item.id, offer_id: activeOffer.id })
    : cartLineKey({ item_id: item.id });
  const itemName = language === "ar" && item.name_ar ? item.name_ar : item.name;
  const itemDescription = (
    language === "ar" && item.description_ar ? item.description_ar : item.description
  )?.trim();

  return (
    <article
      className={`relative [contain-intrinsic-size:auto_160px] [content-visibility:auto] rounded-[24px] border border-stone-200 bg-white p-3 shadow-sm transition ${
        item.is_available ? "" : "opacity-65"
      }`}
      data-testid={`menu-item-${item.id}`}
    >
      {/* The whole card opens the item (photo, full description, options);
          the + and stepper buttons sit above it and keep the quick add. */}
      <button
        aria-label={itemName}
        className="focus-ring absolute inset-0 rounded-[24px]"
        data-testid={`open-item-${item.id}`}
        onClick={() => onOpenOptions(item, activeOffer)}
        type="button"
      />
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-black text-ink">{itemName}</h3>
            {activeOffer ? (
              <span className="inline-flex items-center rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-black text-white">
                {t.offer}
              </span>
            ) : null}
            {item.is_featured ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-700">
                <Star className="fill-current" size={11} />
                {t.bestSeller}
              </span>
            ) : null}
          </div>

          {itemDescription ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-500">{itemDescription}</p>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              {activeOffer ? (
                <>
                  <p className="text-xs font-semibold text-stone-400 line-through">
                    {formatCurrency(item.price, restaurant)}
                  </p>
                  <p className="text-base font-black text-leaf">
                    {formatCurrency(activeOffer.promotional_price, restaurant)}
                  </p>
                </>
              ) : fromPrice !== null ? (
                <p className="text-base font-black text-ink">
                  <span className="text-xs font-bold text-stone-500">{t.priceFrom} </span>
                  {formatCurrency(fromPrice, restaurant)}
                </p>
              ) : (
                <p className="text-base font-black text-ink">{formatCurrency(item.price, restaurant)}</p>
              )}
              {!item.is_available ? (
                <p className="mt-1 text-xs font-semibold text-rose-500">{t.unavailable}</p>
              ) : null}
            </div>

            {hasOptions ? (
              <div className="relative flex items-center gap-2">
                {totalQuantity > 0 ? (
                  <span className="grid h-7 min-w-7 place-items-center rounded-full bg-mint/25 px-2 text-xs font-black text-leaf">
                    {totalQuantity}
                  </span>
                ) : null}
                <button
                  aria-label={`${t.customize} ${itemName}`}
                  className="focus-ring inline-flex h-11 w-11 items-center justify-center rounded-full bg-leaf text-white shadow-sm disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600"
                  data-testid={`add-item-${item.id}`}
                  disabled={!item.is_available || !orderingAvailable}
                  onClick={() => onOpenOptions(item, activeOffer)}
                  type="button"
                >
                  <Plus size={18} />
                </button>
              </div>
            ) : cartLine ? (
              <div className="relative inline-flex items-center overflow-hidden rounded-full border border-stone-200 bg-stone-50">
                <button
                  aria-label={`${t.remove} ${itemName}`}
                  className="focus-ring grid h-11 w-11 place-items-center text-stone-700"
                  onClick={() => onDecrement(plainLineKey)}
                  type="button"
                >
                  <Minus size={16} />
                </button>
                <span className="w-8 text-center text-sm font-bold">{cartLine.quantity}</span>
                <button
                  aria-label={`${t.addMore} ${itemName}`}
                  className="focus-ring grid h-11 w-11 place-items-center text-stone-700"
                  disabled={
                    !orderingAvailable ||
                    (Boolean(activeOffer) &&
                      offerQuantity >= (activeOffer?.max_quantity_per_order ?? 1))
                  }
                  onClick={() =>
                    activeOffer
                      ? onIncrementOffer(plainLineKey, activeOffer)
                      : onIncrement(plainLineKey)
                  }
                  type="button"
                >
                  <Plus size={16} />
                </button>
              </div>
            ) : (
              <button
                aria-label={`${t.add} ${itemName}`}
                className="focus-ring relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-leaf text-white shadow-sm disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600"
                data-testid={`add-item-${item.id}`}
                disabled={
                  !item.is_available || !orderingAvailable
                }
                onClick={() =>
                  activeOffer ? onAddOffer(item, activeOffer) : onAddItem(item)
                }
                type="button"
              >
                <Plus size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="pointer-events-none relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-linen">
          {item.image_url ? (
            <Image
              alt=""
              className="h-full w-full object-cover"
              height={112}
              loading="lazy"
              src={item.image_url}
              unoptimized={!isOptimizableImageUrl(item.image_url)}
              width={112}
            />
          ) : (
            // No photo: the initial, not a second copy of the name or badge.
            <div aria-hidden className="grid h-full w-full place-items-center text-4xl font-black text-ink/20">
              {itemName.trim().charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </article>
  );
});
