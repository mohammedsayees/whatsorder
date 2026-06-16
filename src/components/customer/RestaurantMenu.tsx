"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bike,
  ChevronLeft,
  Clock3,
  Heart,
  MapPin,
  Menu,
  Minus,
  Plus,
  Search,
  Share2,
  ShoppingBag,
  Star,
  X
} from "lucide-react";
import { formatAED } from "@/lib/currency";
import { useCart } from "@/components/customer/CartProvider";
import type { MenuCategory, MenuItem, Restaurant } from "@/lib/types";

const CATEGORY_SCROLL_OFFSET = 172;

type CategoryWithItems = {
  category: MenuCategory;
  items: MenuItem[];
  availableItemCount: number;
};

function getCategorySectionId(categoryId: string) {
  return `category-${categoryId}`;
}

export function RestaurantMenu({
  restaurant,
  categories,
  items
}: {
  restaurant: Restaurant;
  categories: MenuCategory[];
  items: MenuItem[];
}) {
  const cart = useCart();
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(categories[0]?.id ?? null);
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const categoriesWithItems = useMemo<CategoryWithItems[]>(
    () =>
      categories
        .map((category) => {
          const categoryItems = items.filter((item) => item.category_id === category.id);

          return {
            category,
            items: categoryItems,
            availableItemCount: categoryItems.filter((item) => item.is_available).length
          };
        })
        .filter((entry) => entry.availableItemCount > 0),
    [categories, items]
  );

  const featuredItems = useMemo(
    () => items.filter((item) => item.is_available && item.is_featured).slice(0, 3),
    [items]
  );

  const coverImageUrl =
    restaurant.logo_url ??
    items.find((item) => item.image_url)?.image_url ??
    null;

  const cuisineLabel = restaurant.address?.split(",").slice(0, 2).join(" • ") || "Fresh cafe favourites";
  const ratingValue = 4.7;
  const ratingCount = items.length > 8 ? "120+" : "50+";
  const etaText = "25-35 min";
  const offerTitle =
    featuredItems.length > 0
      ? `${featuredItems[0].name} is trending today`
      : "Order directly on WhatsApp and skip the confusion";

  useEffect(() => {
    if (!categoriesWithItems.length) {
      setActiveCategoryId(null);
      return;
    }

    setActiveCategoryId((current) => {
      const currentStillVisible = categoriesWithItems.some((entry) => entry.category.id === current);

      return currentStillVisible ? current : categoriesWithItems[0].category.id;
    });
  }, [categoriesWithItems]);

  useEffect(() => {
    if (!categoriesWithItems.length) {
      return;
    }

    let frameId: number | null = null;

    const updateActiveCategory = () => {
      frameId = null;
      const stickyOffset = CATEGORY_SCROLL_OFFSET + 16;
      let nextActiveId = categoriesWithItems[0]?.category.id ?? null;

      for (const entry of categoriesWithItems) {
        const element = document.getElementById(getCategorySectionId(entry.category.id));

        if (!element) {
          continue;
        }

        if (element.getBoundingClientRect().top <= stickyOffset) {
          nextActiveId = entry.category.id;
        }
      }

      setActiveCategoryId(nextActiveId);
    };

    const scheduleActiveCategoryUpdate = () => {
      if (frameId !== null) {
        return;
      }

      frameId = window.requestAnimationFrame(updateActiveCategory);
    };

    updateActiveCategory();
    window.addEventListener("scroll", scheduleActiveCategoryUpdate, { passive: true });
    window.addEventListener("resize", scheduleActiveCategoryUpdate);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      window.removeEventListener("scroll", scheduleActiveCategoryUpdate);
      window.removeEventListener("resize", scheduleActiveCategoryUpdate);
    };
  }, [categoriesWithItems]);

  useEffect(() => {
    if (!activeCategoryId) {
      return;
    }

    tabRefs.current[activeCategoryId]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center"
    });
  }, [activeCategoryId]);

  const scrollToCategory = (categoryId: string) => {
    const element = document.getElementById(getCategorySectionId(categoryId));

    if (!element) {
      return;
    }

    const top = element.getBoundingClientRect().top + window.scrollY - CATEGORY_SCROLL_OFFSET;

    window.scrollTo({
      top,
      behavior: "smooth"
    });

    setActiveCategoryId(categoryId);
    setIsCategorySheetOpen(false);
  };

  return (
    <>
      <main className="mx-auto w-full max-w-3xl pb-32">
        <section className="relative">
          <div className="relative h-44 overflow-hidden bg-ink sm:h-56">
            {coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={restaurant.name}
                className="h-full w-full object-cover"
                loading="eager"
                src={coverImageUrl}
              />
            ) : (
              <div className="h-full w-full bg-[radial-gradient(circle_at_top_left,_rgba(52,211,153,0.35),_transparent_45%),linear-gradient(135deg,#0f172a_0%,#1f2937_48%,#111827_100%)]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-black/10" />

            <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-4">
              <button
                aria-label="Go back"
                className="focus-ring grid h-10 w-10 place-items-center rounded-full bg-white/92 text-ink shadow-sm"
                onClick={() => window.history.back()}
                type="button"
              >
                <ChevronLeft size={18} />
              </button>

              <div className="flex items-center gap-2">
                <button
                  aria-label="Search menu"
                  className="focus-ring grid h-10 w-10 place-items-center rounded-full bg-white/92 text-ink shadow-sm"
                  onClick={() => window.scrollTo({ top: 300, behavior: "smooth" })}
                  type="button"
                >
                  <Search size={18} />
                </button>
                <button
                  aria-label="Share menu"
                  className="focus-ring grid h-10 w-10 place-items-center rounded-full bg-white/92 text-ink shadow-sm"
                  onClick={async () => {
                    const shareUrl = window.location.href;

                    if (navigator.share) {
                      await navigator.share({
                        title: restaurant.name,
                        text: `Order from ${restaurant.name} on WhatsOrder`,
                        url: shareUrl
                      });
                      return;
                    }

                    await navigator.clipboard.writeText(shareUrl);
                  }}
                  type="button"
                >
                  <Share2 size={18} />
                </button>
                <button
                  aria-label="Save restaurant"
                  className="focus-ring grid h-10 w-10 place-items-center rounded-full bg-white/92 text-ink shadow-sm"
                  type="button"
                >
                  <Heart size={18} />
                </button>
              </div>
            </div>
          </div>

          <div className="relative z-10 -mt-8 px-4">
            <div className="rounded-[28px] bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.12)] ring-1 ring-black/5">
              <div className="flex items-start gap-3">
                {restaurant.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={`${restaurant.name} logo`}
                    className="h-16 w-16 rounded-2xl object-cover ring-1 ring-stone-200"
                    src={restaurant.logo_url}
                  />
                ) : (
                  <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-mint/20 text-lg font-black text-leaf">
                    {restaurant.name.slice(0, 2).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-leaf">
                    WhatsApp ordering
                  </p>
                  <h1 className="mt-1 text-2xl font-black text-ink">{restaurant.name}</h1>
                  <p className="mt-1 text-sm text-stone-500">{cuisineLabel}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-stone-600">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                      <Star size={13} className="fill-current" />
                      {ratingValue} ({ratingCount})
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1">
                      <Clock3 size={13} />
                      {etaText}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1">
                      <Bike size={13} />
                      Delivery {formatAED(restaurant.delivery_fee)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1">
                      <MapPin size={13} />
                      Pickup available
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-linen p-3">
                <p className="text-sm font-bold text-ink">{offerTitle}</p>
                <button className="mt-1 text-xs font-semibold text-leaf" type="button">
                  More info
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="sticky top-0 z-20 mt-4 border-y border-stone-200/80 bg-white/95 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              aria-label="Browse categories"
              className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink"
              onClick={() => setIsCategorySheetOpen(true)}
              type="button"
            >
              <Menu size={18} />
            </button>

            <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-5 overflow-x-auto scroll-smooth">
              {categoriesWithItems.map(({ category }) => {
                const isActive = activeCategoryId === category.id;

                return (
                  <button
                    key={category.id}
                    ref={(element) => {
                      tabRefs.current[category.id] = element;
                    }}
                    className={`focus-ring relative shrink-0 px-0 py-2 text-sm transition ${
                      isActive
                        ? "font-black text-ink after:absolute after:inset-x-0 after:-bottom-3 after:h-1 after:rounded-full after:bg-leaf"
                        : "font-semibold text-stone-500"
                    }`}
                    onClick={() => scrollToCategory(category.id)}
                    type="button"
                  >
                    {category.name}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="space-y-8 px-4 pt-5">
          {categoriesWithItems.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center shadow-sm">
              <h2 className="text-lg font-black text-ink">Menu is being prepared</h2>
              <p className="mt-2 text-sm text-stone-500">
                This restaurant has not published menu items yet. Check back shortly.
              </p>
            </div>
          ) : null}

          {categoriesWithItems.map(({ category, items: categoryItems, availableItemCount }) => (
            <section
              key={category.id}
              id={getCategorySectionId(category.id)}
              className="scroll-mt-44"
              data-category-id={category.id}
            >
              <div className="mb-4">
                <h2 className="text-xl font-black text-ink">{category.name}</h2>
                <p className="mt-1 text-sm text-stone-500">
                  {availableItemCount} item{availableItemCount > 1 ? "s" : ""} available
                </p>
              </div>

              <div className="space-y-3">
                {categoryItems.map((item) => {
                  const cartLine = cart.lines.find((line) => line.item_id === item.id);

                  return (
                    <article
                      key={item.id}
                      className={`rounded-[24px] border border-stone-200 bg-white p-3 shadow-sm transition ${
                        item.is_available ? "" : "opacity-65"
                      }`}
                      data-testid={`menu-item-${item.id}`}
                    >
                      <div className="flex gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-black text-ink">{item.name}</h3>
                            {item.is_featured ? (
                              <span className="rounded-full bg-mint/20 px-2 py-0.5 text-[11px] font-bold text-leaf">
                                Popular
                              </span>
                            ) : null}
                          </div>

                          <p className="mt-2 text-sm leading-6 text-stone-500">
                            {item.description || "Freshly prepared and sent as a structured WhatsApp order."}
                          </p>

                          <div className="mt-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-base font-black text-ink">{formatAED(item.price)}</p>
                              {!item.is_available ? (
                                <p className="mt-1 text-xs font-semibold text-rose-500">Currently unavailable</p>
                              ) : null}
                            </div>

                            {cartLine ? (
                              <div className="inline-flex items-center overflow-hidden rounded-full border border-stone-200 bg-stone-50">
                                <button
                                  aria-label={`Remove ${item.name}`}
                                  className="focus-ring grid h-9 w-9 place-items-center text-stone-700"
                                  onClick={() => cart.decrement(item.id)}
                                  type="button"
                                >
                                  <Minus size={16} />
                                </button>
                                <span className="w-8 text-center text-sm font-bold">{cartLine.quantity}</span>
                                <button
                                  aria-label={`Add more ${item.name}`}
                                  className="focus-ring grid h-9 w-9 place-items-center text-stone-700"
                                  onClick={() => cart.increment(item.id)}
                                  type="button"
                                >
                                  <Plus size={16} />
                                </button>
                              </div>
                            ) : (
                              <button
                                aria-label={`Add ${item.name}`}
                                className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full bg-leaf text-white shadow-sm disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600"
                                data-testid={`add-item-${item.id}`}
                                disabled={!item.is_available}
                                onClick={() => cart.addItem(item)}
                                type="button"
                              >
                                <Plus size={18} />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-linen">
                          {item.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              alt={item.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              src={item.image_url}
                            />
                          ) : (
                            <div className="grid h-full w-full place-items-center px-3 text-center text-xs font-bold text-ink/55">
                              {item.is_featured ? "Popular pick" : item.name}
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </section>
      </main>

      {cart.count > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/96 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10">
              <ShoppingBag size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black">
                {cart.count} item{cart.count > 1 ? "s" : ""} in cart
              </p>
            </div>
            <Link
              href={`/r/${restaurant.slug}/checkout`}
              className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-black text-ink"
            >
              View cart
              <span>{formatAED(cart.subtotal)}</span>
            </Link>
          </div>
        </div>
      ) : null}

      {isCategorySheetOpen ? (
        <div className="fixed inset-0 z-40 bg-black/40" role="dialog" aria-modal="true">
          <button
            aria-label="Close categories"
            className="absolute inset-0 cursor-default"
            onClick={() => setIsCategorySheetOpen(false)}
            type="button"
          />

          <div className="absolute inset-x-0 bottom-0 rounded-t-[28px] bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 shadow-2xl">
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-stone-200" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-ink">Browse categories</h2>
                <p className="text-sm text-stone-500">Jump straight to the section you want.</p>
              </div>
              <button
                aria-label="Close categories"
                className="focus-ring grid h-10 w-10 place-items-center rounded-full border border-stone-200 bg-white text-ink"
                onClick={() => setIsCategorySheetOpen(false)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-2">
              {categoriesWithItems.map(({ category, availableItemCount }) => (
                <button
                  key={category.id}
                  className={`focus-ring grid grid-cols-[1fr_auto] items-center gap-4 rounded-2xl border px-4 py-3 text-left ${
                    activeCategoryId === category.id
                      ? "border-leaf bg-mint/10"
                      : "border-stone-200 bg-white"
                  }`}
                  onClick={() => scrollToCategory(category.id)}
                  type="button"
                >
                  <div>
                    <p className="font-bold text-ink">{category.name}</p>
                    <p className="text-sm text-stone-500">Tap to jump to this section</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="min-w-8 rounded-full bg-stone-100 px-2.5 py-1 text-center text-sm font-black text-ink">
                      {availableItemCount}
                    </span>
                    <ChevronLeft className="rotate-180 text-stone-400" size={18} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
