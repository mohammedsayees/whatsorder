"use client";
import { MenuItemCard, isOptimizableImageUrl } from "./MenuItemCard";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  ChevronDown,
  ChevronLeft,
  Clock3,
  Menu,
  Minus,
  Plus,
  Search,
  Share2,
  ShoppingBag,
  Star,
  Users,
  X
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { minimumOrderRemaining } from "@/lib/security";
import {
  formatOpeningTime,
  isRestaurantOpen,
  normalizeOpeningHours,
  weekDayLabels,
  weekDays
} from "@/lib/opening-hours";
import { customerTranslations, getTextDirection } from "@/lib/customer-i18n";
import { cartLineKey } from "@/lib/cart-line";
import { trackFunnel } from "@/lib/customer-funnel-client";
import { prepRangeLabel } from "@/lib/prep-time";
import { useCart } from "@/components/customer/CartProvider";
import {
  FulfilmentSelector,
  fulfilmentLabel
} from "@/components/customer/FulfilmentSelector";
import { LanguageToggle } from "@/components/customer/LanguageToggle";
import { useCustomerLanguage } from "@/components/customer/useCustomerLanguage";
import { useFulfilmentPreference } from "@/components/customer/useFulfilmentPreference";
import { resolveOptionGroupsByItem } from "@/lib/menu-option-groups";
import type { CustomerLoyalty, CustomerRecentOrder } from "@/lib/customer-auth/context";
import type {
  CartLine,
  CustomerMenuCategory,
  CustomerMenuItem,
  CustomerMenuOffer,
  CustomerMenuOptionCatalog,
  PublicFeedbackSummary,
  PublicRestaurant
} from "@/lib/types";

// Fallback height of the sticky search + category bar until it is measured.
const DEFAULT_STICKY_BAR_HEIGHT = 108;
// Breathing room between the sticky bar and a section heading.
const STICKY_GAP = 12;
const BEST_SELLERS_CATEGORY_ID = "best-sellers";
const EMPTY_MENU_ITEMS: CustomerMenuItem[] = [];

// Most menu visits never customize an item. Keep the options UI out of the
// critical customer bundle and load it only after a configurable item is
// opened. The grouping helper stays in the initial chunk because the menu
// needs it to decide whether each item has options.
const ItemOptionsSheet = dynamic(
  () =>
    import("@/components/customer/ItemOptionsSheet").then(
      (module) => module.ItemOptionsSheet
    ),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4">
        <div className="h-48 w-full animate-pulse rounded-t-[28px] bg-white sm:max-w-md sm:rounded-[28px]" />
      </div>
    )
  }
);

// Anonymous customers have no loyalty or reorder content. Keep that UI and its
// icons out of the critical menu chunk; Next only loads it when the server
// supplies returning-customer data.
const ReturningCustomerPanel = dynamic(() =>
  import("@/components/customer/ReturningCustomerPanel").then(
    (module) => module.ReturningCustomerPanel
  )
);

// The category drawer is interaction-only. Loading it on the first category
// button tap keeps its markup and close icon out of the initial menu chunk.
const CategorySheet = dynamic(
  () =>
    import("@/components/customer/CategorySheet").then(
      (module) => module.CategorySheet
    ),
  { ssr: false }
);

// Loaded only for an authenticated owner's guided test-order link. Ordinary
// customer visits do not download onboarding UI or its server-action reference.
const OnboardingTestOrderGuide = dynamic(() =>
  import("@/components/customer/OnboardingTestOrderGuide").then(
    (module) => module.OnboardingTestOrderGuide
  )
);

// Shown to repeat visitors only, so first visits never download it.
// Group orders load only when a group is started or a group link is opened.
const GroupOrderBar = dynamic(
  () => import("@/components/customer/GroupOrder").then((module) => module.GroupOrderBar),
  { ssr: false }
);
const GroupOrderStart = dynamic(
  () => import("@/components/customer/GroupOrder").then((module) => module.GroupOrderStart),
  { ssr: false }
);

// Same rule as isShareToken in lib/group-order, inlined so the menu chunk
// doesn't pull in the group helpers.
const GROUP_TOKEN = /^[A-Za-z0-9_-]{22,64}$/;

const InstallAppPrompt = dynamic(
  () =>
    import("@/components/customer/InstallAppPrompt").then(
      (module) => module.InstallAppPrompt
    ),
  { ssr: false }
);

type CategoryWithItems = {
  category: CustomerMenuCategory;
  items: CustomerMenuItem[];
  availableItemCount: number;
};

// next/image optimization is configured for Supabase Storage hosts only
// (next.config.ts remotePatterns). Admin-entered external image URLs still
// render, just without the optimizer, instead of crashing the menu.
function getCategorySectionId(categoryId: string) {
  return `category-${categoryId}`;
}

export function RestaurantMenu({
  restaurant,
  categories,
  feedback,
  items,
  offers,
  optionCatalog,
  prepMinutes = null
}: {
  restaurant: PublicRestaurant;
  categories: CustomerMenuCategory[];
  feedback: PublicFeedbackSummary;
  items: CustomerMenuItem[];
  offers: CustomerMenuOffer[];
  optionCatalog?: CustomerMenuOptionCatalog;
  /** Measured median prep time; null when there is not enough history. */
  prepMinutes?: number | null;
}) {
  const cart = useCart();
  // Cart size once the saved cart has loaded: growth past it is a real add
  // in this visit, not a restored cart.
  const loadedCartCount = useRef<number | null>(null);

  useEffect(() => {
    if (!cart.isReady) {
      return;
    }

    if (loadedCartCount.current === null) {
      loadedCartCount.current = cart.count;
      return;
    }

    if (cart.count > loadedCartCount.current) {
      trackFunnel(restaurant.id, "item_added");
    }
  }, [cart.count, cart.isReady, restaurant.id]);
  const amountRemaining = minimumOrderRemaining(
    cart.subtotal,
    restaurant.minimum_order_amount
  );
  const minimumReached = amountRemaining === 0;
  const { language, setLanguage } = useCustomerLanguage();
  const t = customerTranslations[language];
  const direction = getTextDirection(language);
  // The shared menu HTML may be edge-cached. Start from a deterministic value
  // for SSR/hydration, then evaluate opening hours on the customer's clock.
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const scheduleOpen =
    currentTime === null ||
    isRestaurantOpen(
      restaurant.opening_hours_enabled,
      restaurant.opening_hours,
      currentTime,
      restaurant.time_zone
    );
  const orderingAvailable =
    restaurant.accepting_orders !== false && scheduleOpen;
  const [personalization, setPersonalization] = useState<{
    loyalty: CustomerLoyalty | null;
    recentOrders: CustomerRecentOrder[];
  }>({ loyalty: null, recentOrders: [] });
  const [tableNumber, setTableNumber] = useState("");
  // Marketing link source (e.g. ?src=poster-<id>), carried to checkout only.
  const [attributionSource, setAttributionSource] = useState("");
  const [onboardingTest, setOnboardingTest] = useState(false);
  const hasReturningCustomerContent =
    Boolean(
      personalization.loyalty?.enabled &&
        (personalization.loyalty.stamps_required ?? 0) > 0
    ) || personalization.recentOrders.length > 0;
  const weeklyHours = normalizeOpeningHours(restaurant.opening_hours);
  const hasBestSellers = items.some((item) => item.is_featured && item.is_available);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
    hasBestSellers ? BEST_SELLERS_CATEGORY_ID : categories[0]?.id ?? null
  );
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false);
  const [showHours, setShowHours] = useState(false);
  // Install prompts only for repeat visitors; first visits are for ordering.
  const [isRepeatVisit, setIsRepeatVisit] = useState(false);
  const [groupToken, setGroupToken] = useState<string | null>(null);
  const [isGroupStartOpen, setIsGroupStartOpen] = useState(false);
  const fulfilment = useFulfilmentPreference(restaurant, tableNumber);
  const stickyBarRef = useRef<HTMLElement | null>(null);
  const menuStartRef = useRef<HTMLDivElement | null>(null);
  const [stickyBarHeight, setStickyBarHeight] = useState(DEFAULT_STICKY_BAR_HEIGHT);
  const scrollOffset = stickyBarHeight + STICKY_GAP;
  const [searchQuery, setSearchQuery] = useState("");
  const [optionsSheet, setOptionsSheet] = useState<{
    item: CustomerMenuItem;
    offer: CustomerMenuOffer | null;
  } | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    setCurrentTime(new Date());
    const clock = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    const currentQuery = new URLSearchParams(window.location.search);
    const queryTableNumber = currentQuery
      .get("table")
      ?.trim()
      .slice(0, 40);
    setTableNumber(queryTableNumber ?? "");
    setAttributionSource(currentQuery.get("src")?.trim().slice(0, 64) ?? "");
    setOnboardingTest(currentQuery.get("onboarding") === "test-order");
    const queryGroup = currentQuery.get("group");
    setGroupToken(queryGroup && GROUP_TOKEN.test(queryGroup) ? queryGroup : null);
    trackFunnel(restaurant.id, "menu_view");

    try {
      // Count one visit per browser session, per store.
      const visitsKey = `whatsorder-visits-v1-${restaurant.slug}`;
      const sessionKey = `${visitsKey}-counted`;
      let visits = Number(window.localStorage.getItem(visitsKey)) || 0;

      if (!window.sessionStorage.getItem(sessionKey)) {
        visits += 1;
        window.localStorage.setItem(visitsKey, String(visits));
        window.sessionStorage.setItem(sessionKey, "1");
      }

      setIsRepeatVisit(visits >= 2);
    } catch {
      // Storage blocked: skip the install prompt.
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      restaurantId: restaurant.id,
      scope: "menu"
    });

    void fetch(`/api/customer/context?${params.toString()}`, {
      credentials: "same-origin",
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          loyalty?: CustomerLoyalty | null;
          recentOrders?: CustomerRecentOrder[];
        };
      })
      .then((customer) => {
        if (!customer) return;
        setPersonalization({
          loyalty: customer.loyalty ?? null,
          recentOrders: Array.isArray(customer.recentOrders)
            ? customer.recentOrders
            : []
        });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // Personalization is optional; the public menu remains usable.
        }
      });

    return () => {
      window.clearInterval(clock);
      controller.abort();
    };
  }, [restaurant.id, restaurant.slug]);

  useEffect(() => {
    const element = stickyBarRef.current;

    if (!element) {
      return;
    }

    const update = () =>
      setStickyBarHeight(Math.round(element.getBoundingClientRect().height));
    update();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Option groups attached to each item, in link order, with only available
  // options. Items with an entry here open the options sheet instead of the
  // instant add / stepper controls.
  const resolvedGroupsByItemId = useMemo(
    () => resolveOptionGroupsByItem(optionCatalog),
    [optionCatalog]
  );

  // With options, one item can span several cart lines — badges show the
  // per-item aggregate, and offer caps apply to the per-offer aggregate.
  // Aggregated once per cart change instead of scanning the cart per item.
  const { linesByKey, quantityByItemId, quantityByOfferId } = useMemo(() => {
    const byKey = new Map<string, CartLine>();
    const byItem = new Map<string, number>();
    const byOffer = new Map<string, number>();

    for (const line of cart.lines) {
      byKey.set(cartLineKey(line), line);
      byItem.set(line.item_id, (byItem.get(line.item_id) ?? 0) + line.quantity);

      if (line.offer_id) {
        byOffer.set(line.offer_id, (byOffer.get(line.offer_id) ?? 0) + line.quantity);
      }
    }

    return { linesByKey: byKey, quantityByItemId: byItem, quantityByOfferId: byOffer };
  }, [cart.lines]);
  const offerQuantityInCart = (offerId: string) =>
    quantityByOfferId.get(offerId) ?? 0;

  // Defer the filter so typing stays responsive: the input updates per
  // keystroke, the (full-list re-render) filtering follows at lower priority.
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const categoriesWithItems = useMemo<CategoryWithItems[]>(
    () => {
      const normalizedSearch = deferredSearchQuery.trim().toLowerCase();
      const matchesSearch = (item: CustomerMenuItem) =>
        !normalizedSearch ||
        [item.name, item.name_ar, item.description, item.description_ar].some((value) =>
          value?.toLowerCase().includes(normalizedSearch)
        );

      // Index in one pass so search work grows with the number of items, not
      // categories × items. Large menus used to rescan the full item array for
      // every category on each deferred keystroke.
      const itemsByCategoryId = new Map<string, CustomerMenuItem[]>();
      const availableCountByCategoryId = new Map<string, number>();
      const bestSellerItems: CustomerMenuItem[] = [];

      for (const item of items) {
        if (!matchesSearch(item)) {
          continue;
        }

        const categoryItems = itemsByCategoryId.get(item.category_id) ?? [];
        categoryItems.push(item);
        itemsByCategoryId.set(item.category_id, categoryItems);

        if (item.is_available) {
          availableCountByCategoryId.set(
            item.category_id,
            (availableCountByCategoryId.get(item.category_id) ?? 0) + 1
          );

          // While searching, matches already show in their own category.
          if (item.is_featured && !normalizedSearch) {
            bestSellerItems.push(item);
          }
        }
      }

      const regularCategories = categories
        .map((category) => ({
          category,
          items: itemsByCategoryId.get(category.id) ?? EMPTY_MENU_ITEMS,
          availableItemCount: availableCountByCategoryId.get(category.id) ?? 0
        }))
        .filter((entry) => entry.availableItemCount > 0);

      return bestSellerItems.length > 0
        ? [
            {
              category: {
                id: BEST_SELLERS_CATEGORY_ID,
                name: customerTranslations.en.bestSellers,
                name_ar: customerTranslations.ar.bestSellers
              },
              items: bestSellerItems,
              availableItemCount: bestSellerItems.length
            },
            ...regularCategories
          ]
        : regularCategories;
    },
    [categories, items, deferredSearchQuery]
  );

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );
  const offersByItemId = useMemo(
    () => new Map(offers.map((offer) => [offer.menu_item_id, offer])),
    [offers]
  );
  const visibleActiveCategoryId = categoriesWithItems.some(
    (entry) => entry.category.id === activeCategoryId
  )
    ? activeCategoryId
    : categoriesWithItems[0]?.category.id ?? null;

  const coverImageUrl =
    restaurant.cover_image_url ??
    restaurant.logo_url ??
    items.find((item) => item.image_url)?.image_url ??
    null;

  const restaurantName = language === "ar" && restaurant.name_ar ? restaurant.name_ar : restaurant.name;
  const restaurantAddress = language === "ar" && restaurant.address_ar ? restaurant.address_ar : restaurant.address;
  const cuisineLabel =
    (language === "ar" && restaurant.subtitle_ar ? restaurant.subtitle_ar : null) ??
    restaurantAddress?.split(",").slice(0, 2).join(" • ") ??
    t.freshCafeFavourites;
  // Offers whose item is on sale right now; others are hidden from the rail.
  const visibleOffers = offers.flatMap((offer) => {
    const item = itemsById.get(offer.menu_item_id);
    return item?.is_available ? [{ offer, item }] : [];
  });
  const fulfilmentSummary =
    fulfilment.fulfilmentType === "delivery"
      ? [
          restaurant.delivery_fee > 0
            ? `${t.deliveryFee} ${formatCurrency(restaurant.delivery_fee, restaurant)}`
            : t.freeDelivery,
          restaurant.minimum_order_amount > 0
            ? `${t.minimumOrder} ${formatCurrency(restaurant.minimum_order_amount, restaurant)}`
            : null
        ]
          .filter(Boolean)
          .join(" · ")
      : fulfilment.fulfilmentType === "takeaway"
        ? `${t.pickupFrom} ${restaurantAddress || restaurantName}`
        : fulfilment.fulfilmentType === "car_pickup"
          ? t.carPickupHelp
          : tableNumber
            ? `${t.table} ${tableNumber}`
            : t.dineInHelp;
  const checkoutQuery = [
    tableNumber ? `table=${encodeURIComponent(tableNumber)}` : "",
    onboardingTest ? "onboarding=test-order" : "",
    attributionSource ? `src=${encodeURIComponent(attributionSource)}` : ""
  ].filter(Boolean);
  const checkoutHref = `/r/${restaurant.slug}/checkout${
    checkoutQuery.length > 0 ? `?${checkoutQuery.join("&")}` : ""
  }`;
  useEffect(() => {
    if (!categoriesWithItems.length) {
      return;
    }

    // Scrollspy without per-frame layout reads: observe a ~1px horizontal
    // band just under the sticky tab bar and let the browser report which
    // section crosses it. The active category is the intersecting section
    // furthest down the document (matching the old "last section whose top
    // passed the sticky offset" rule); an empty band (gap between sections)
    // keeps the previous selection.
    const bandTop = scrollOffset + 4;
    const indexById = new Map(
      categoriesWithItems.map((entry, index) => [entry.category.id, index])
    );
    const intersecting = new Set<string>();
    let observer: IntersectionObserver | null = null;

    const observe = () => {
      observer?.disconnect();
      intersecting.clear();

      // The band's bottom edge is expressed as a negative bottom rootMargin,
      // which depends on the viewport height — rebuilt on resize.
      const bandBottomMargin = Math.max(0, window.innerHeight - bandTop - 1);

      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const categoryId = (entry.target as HTMLElement).dataset.categoryId;

            if (!categoryId) {
              continue;
            }

            if (entry.isIntersecting) {
              intersecting.add(categoryId);
            } else {
              intersecting.delete(categoryId);
            }
          }

          let nextActiveId: string | null = null;
          let bestIndex = -1;

          for (const categoryId of intersecting) {
            const index = indexById.get(categoryId) ?? -1;

            if (index > bestIndex) {
              bestIndex = index;
              nextActiveId = categoryId;
            }
          }

          if (nextActiveId) {
            setActiveCategoryId(nextActiveId);
          }
        },
        { rootMargin: `-${bandTop}px 0px -${bandBottomMargin}px 0px`, threshold: 0 }
      );

      for (const entry of categoriesWithItems) {
        const element = document.getElementById(getCategorySectionId(entry.category.id));

        if (element) {
          observer.observe(element);
        }
      }
    };

    observe();
    window.addEventListener("resize", observe);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", observe);
    };
  }, [categoriesWithItems, scrollOffset]);

  useEffect(() => {
    if (!visibleActiveCategoryId) {
      return;
    }

    tabRefs.current[visibleActiveCategoryId]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center"
    });
  }, [visibleActiveCategoryId]);

  // Stable reference so memoized item cards don't re-render on parent renders.
  const openOptionsSheet = useCallback(
    (item: CustomerMenuItem, offer: CustomerMenuOffer | null) =>
      setOptionsSheet({ item, offer }),
    []
  );

  // Typing while scrolled deep into the menu would leave the customer
  // looking at blank space as results shrink; bring the list start up.
  const onSearchChange = (value: string) => {
    setSearchQuery(value);

    if (value.trim().length >= 2) {
      trackFunnel(restaurant.id, "search_used");
    }

    const marker = menuStartRef.current;

    if (!marker) {
      return;
    }

    const menuTop = marker.getBoundingClientRect().top + window.scrollY;

    if (window.scrollY > menuTop) {
      window.scrollTo({ top: menuTop });
    }
  };

  // Keeps ?group= in the address bar in step with group mode, so a refresh
  // or a shared link lands in the same group.
  const setGroupLink = (token: string | null) => {
    const url = new URL(window.location.href);

    if (token) {
      url.searchParams.set("group", token);
    } else {
      url.searchParams.delete("group");
    }

    window.history.replaceState(null, "", url.toString());
    setGroupToken(token);
  };

  const scrollToCategory = (categoryId: string) => {
    const element = document.getElementById(getCategorySectionId(categoryId));

    if (!element) {
      return;
    }

    const top = element.getBoundingClientRect().top + window.scrollY - scrollOffset;

    window.scrollTo({
      top,
      behavior: "smooth"
    });

    setActiveCategoryId(categoryId);
    setIsCategorySheetOpen(false);
  };

  return (
    <div dir={direction}>
      <main className="mx-auto w-full max-w-3xl pb-32">
        <header>
          <div className="relative h-28 overflow-hidden bg-ink sm:h-36">
            {coverImageUrl ? (
              <Image
                alt=""
                className="object-cover"
                fill
                priority
                sizes="(min-width: 768px) 768px, 100vw"
                src={coverImageUrl}
                unoptimized={!isOptimizableImageUrl(coverImageUrl)}
              />
            ) : (
              <div className="h-full w-full bg-[radial-gradient(circle_at_top_left,_rgba(52,211,153,0.35),_transparent_45%),linear-gradient(135deg,#0f172a_0%,#1f2937_48%,#111827_100%)]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/5 to-black/30" />

            <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-4 pt-3">
              <button
                aria-label={t.goBack}
                className="focus-ring grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ink shadow-sm"
                onClick={() => window.history.back()}
                type="button"
              >
                <ChevronLeft className={language === "ar" ? "rotate-180" : ""} size={18} />
              </button>

              <div className="flex items-center gap-2">
                <LanguageToggle language={language} setLanguage={setLanguage} />
                <button
                  aria-label={t.shareMenu}
                  className="focus-ring grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ink shadow-sm"
                  onClick={async () => {
                    const shareUrl = window.location.href;

                    try {
                      if (navigator.share) {
                        await navigator.share({
                          title: restaurantName,
                          text: `${t.whatsAppOrdering} - ${restaurantName}`,
                          url: shareUrl
                        });
                        return;
                      }

                      await navigator.clipboard.writeText(shareUrl);
                    } catch {
                      // Dismissed share sheet or blocked clipboard: nothing to do.
                    }
                  }}
                  type="button"
                >
                  <Share2 size={18} />
                </button>
              </div>
            </div>
          </div>

          <div className="px-4">
            <div className="flex items-end gap-3">
              {restaurant.logo_url ? (
                <Image
                  alt={`${restaurantName} logo`}
                  className="relative z-10 -mt-7 h-14 w-14 shrink-0 rounded-2xl bg-white object-cover shadow-sm ring-4 ring-white"
                  height={56}
                  src={restaurant.logo_url}
                  unoptimized={!isOptimizableImageUrl(restaurant.logo_url)}
                  width={56}
                />
              ) : (
                <div className="relative z-10 -mt-7 grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-mint text-lg font-black text-leaf shadow-sm ring-4 ring-white">
                  {restaurantName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <h1 className="min-w-0 flex-1 truncate pt-2 text-xl font-black text-ink">
                {restaurantName}
              </h1>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-stone-500">
              {feedback.averageRating !== null ? (
                <span className="inline-flex items-center gap-1 text-amber-700">
                  <Star size={12} className="fill-current" />
                  {feedback.averageRating.toFixed(1)} ({feedback.reviewCount})
                </span>
              ) : null}
              {restaurant.opening_hours_enabled ? (
                <button
                  aria-expanded={showHours}
                  className={`focus-ring inline-flex items-center gap-1 rounded-full font-black ${
                    scheduleOpen ? "text-emerald-700" : "text-rose-700"
                  }`}
                  onClick={() => setShowHours((current) => !current)}
                  type="button"
                >
                  {scheduleOpen ? t.openNow : t.closedNow}
                  <ChevronDown
                    className={`transition ${showHours ? "rotate-180" : ""}`}
                    size={13}
                  />
                </button>
              ) : null}
              {prepMinutes !== null ? (
                <span
                  className="inline-flex items-center gap-1 text-stone-600"
                  title={`${t.prepTimeLabel} ${prepRangeLabel(prepMinutes)} ${t.minutesShort}`}
                >
                  <Clock3 aria-hidden size={12} />
                  <span className="sr-only">{t.prepTimeLabel}</span>
                  {prepRangeLabel(prepMinutes)} {t.minutesShort}
                </span>
              ) : null}
              <span className="min-w-0 truncate">{cuisineLabel}</span>
            </div>

            {showHours && restaurant.opening_hours_enabled ? (
              <div className="mt-2 space-y-1.5 rounded-2xl border border-stone-200 px-4 py-3 text-sm">
                <p className="text-xs font-black uppercase tracking-wide text-stone-500">
                  {t.openingHours}
                </p>
                {weekDays.map((day) => (
                  <div className="flex justify-between gap-4" key={day}>
                    <span className="font-bold">{weekDayLabels[day]}</span>
                    <span className="text-stone-500">
                      {weeklyHours[day].closed
                        ? t.closed
                        : `${formatOpeningTime(weeklyHours[day].open)}–${formatOpeningTime(
                            weeklyHours[day].close
                          )}`}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {!orderingAvailable ? (
              <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">
                {restaurant.accepting_orders === false ? t.notAcceptingOrders : t.orderClosedHint}
              </p>
            ) : null}

            <div className="mt-3">
              <FulfilmentSelector
                available={fulfilment.available}
                language={language}
                onChange={fulfilment.setFulfilmentType}
                value={fulfilment.fulfilmentType}
              />
              <p className="mt-2 text-xs font-semibold text-stone-500">
                {fulfilment.available.length < 2 ? (
                  <strong className="font-black text-ink">
                    {fulfilmentLabel(fulfilment.fulfilmentType, language)} ·{" "}
                  </strong>
                ) : null}
                {fulfilmentSummary}
              </p>
            </div>

            {orderingAvailable && !groupToken ? (
              <button
                className="focus-ring mt-2 inline-flex items-center gap-1.5 rounded-full text-xs font-black text-leaf underline-offset-4 hover:underline"
                onClick={() => setIsGroupStartOpen(true)}
                type="button"
              >
                <Users aria-hidden size={14} />
                {t.startGroupOrder}
              </button>
            ) : null}

            {isRepeatVisit ? <InstallAppPrompt language={language} /> : null}
          </div>
        </header>

        {onboardingTest ? (
          <OnboardingTestOrderGuide
            cartCount={cart.count}
            restaurantId={restaurant.id}
          />
        ) : null}

        {hasReturningCustomerContent ? (
          <ReturningCustomerPanel
            language={language}
            loyalty={personalization.loyalty}
            recentOrders={personalization.recentOrders}
            restaurant={restaurant}
          />
        ) : null}

        {visibleOffers.length > 0 ? (
          <section className="mt-4">
            <h2 className="px-4 text-base font-black text-ink">{t.specialOffers}</h2>
            <div className="no-scrollbar mt-2 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
              {visibleOffers.map(({ offer, item }) => {
                const title =
                  language === "ar" && offer.title_ar ? offer.title_ar : offer.title;
                const hasOptions = (resolvedGroupsByItemId.get(item.id) ?? []).length > 0;
                const offerLineKey = cartLineKey({ item_id: item.id, offer_id: offer.id });
                const offerQuantity = offerQuantityInCart(offer.id);
                const maximumReached =
                  offerQuantity >= offer.max_quantity_per_order;

                return (
                  <article
                    className="flex w-[78%] max-w-[300px] shrink-0 snap-start gap-3 rounded-2xl border border-stone-200 bg-white p-2.5 shadow-sm"
                    key={offer.id}
                  >
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-linen">
                      {item.image_url ? (
                        <Image
                          alt=""
                          className="object-cover"
                          fill
                          loading="lazy"
                          sizes="80px"
                          src={item.image_url}
                          unoptimized={!isOptimizableImageUrl(item.image_url)}
                        />
                      ) : (
                        <div className="h-full w-full bg-[radial-gradient(circle_at_top_right,_rgba(52,211,153,0.28),_transparent_48%),linear-gradient(135deg,#f7f4ec,#e7f6ee)]" />
                      )}
                      <span className="absolute start-1 top-1 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-black text-white">
                        {t.offer}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <h3 className="line-clamp-2 text-sm font-black leading-5 text-ink">{title}</h3>
                      <div className="mt-auto flex items-end justify-between gap-2 pt-1">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-stone-400 line-through">
                            {formatCurrency(item.price, restaurant)}
                          </p>
                          <p className="text-sm font-black text-leaf">
                            {formatCurrency(offer.promotional_price, restaurant)}
                          </p>
                          {maximumReached ? (
                            <p className="text-[11px] font-semibold text-stone-400">
                              {t.offerMaximum} {offer.max_quantity_per_order}
                            </p>
                          ) : null}
                        </div>
                        {hasOptions ? (
                          <button
                            aria-label={`${t.customize} ${title}`}
                            className="focus-ring inline-flex h-10 shrink-0 items-center gap-1 rounded-full bg-leaf px-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-stone-300"
                            disabled={!orderingAvailable || maximumReached}
                            onClick={() => setOptionsSheet({ item, offer })}
                            type="button"
                          >
                            <Plus size={16} />
                            {offerQuantity > 0 ? offerQuantity : null}
                          </button>
                        ) : offerQuantity > 0 ? (
                          <div className="inline-flex shrink-0 items-center overflow-hidden rounded-full border border-stone-200 bg-stone-50">
                            <button
                              aria-label={`${t.remove} ${title}`}
                              className="focus-ring grid h-10 w-9 place-items-center text-stone-700"
                              onClick={() => cart.decrement(offerLineKey)}
                              type="button"
                            >
                              <Minus size={15} />
                            </button>
                            <span className="w-6 text-center text-sm font-black">
                              {offerQuantity}
                            </span>
                            <button
                              aria-label={`${t.addMore} ${title}`}
                              className="focus-ring grid h-10 w-9 place-items-center text-stone-700 disabled:cursor-not-allowed disabled:text-stone-300"
                              disabled={maximumReached || !orderingAvailable}
                              onClick={() => cart.incrementOffer(offerLineKey, offer)}
                              type="button"
                            >
                              <Plus size={15} />
                            </button>
                          </div>
                        ) : (
                          <button
                            aria-label={`${t.add} ${title}`}
                            className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full bg-leaf text-white disabled:cursor-not-allowed disabled:bg-stone-300"
                            disabled={!orderingAvailable}
                            onClick={() => cart.addOffer(item, offer)}
                            type="button"
                          >
                            <Plus size={17} />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        <div aria-hidden ref={menuStartRef} />
        <section
          className="sticky top-0 z-20 mt-4 border-y border-stone-200/80 bg-white/95 backdrop-blur"
          ref={stickyBarRef}
        >
          <div className="flex items-center gap-2 px-4 pt-3">
            <label className="relative block min-w-0 flex-1">
              <span className="sr-only">{t.searchMenu}</span>
              <Search
                className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-stone-400"
                size={17}
              />
              <input
                autoComplete="off"
                className="focus-ring w-full rounded-full border border-stone-200 bg-stone-50 py-2.5 pe-10 ps-10 text-base sm:text-sm"
                enterKeyHint="search"
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={t.searchMenu}
                type="text"
                value={searchQuery}
              />
              {searchQuery ? (
                <button
                  aria-label={t.clearSearch}
                  className="focus-ring absolute end-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-stone-500"
                  onClick={() => setSearchQuery("")}
                  type="button"
                >
                  <X size={16} />
                </button>
              ) : null}
            </label>
            <button
              aria-label={t.browseCategories}
              className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink"
              onClick={() => setIsCategorySheetOpen(true)}
              type="button"
            >
              <Menu size={18} />
            </button>
          </div>

          <div className="no-scrollbar flex min-w-0 items-center gap-5 overflow-x-auto scroll-smooth px-4 pb-3 pt-2">
            {categoriesWithItems.map(({ category }) => {
              const isActive = visibleActiveCategoryId === category.id;

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
                  {language === "ar" && category.name_ar ? category.name_ar : category.name}
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-8 px-4 pt-5">
          {categoriesWithItems.length === 0 && deferredSearchQuery.trim() ? (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center shadow-sm">
              <h2 className="text-lg font-black text-ink">{t.noSearchResults}</h2>
              <button
                className="focus-ring mt-4 inline-flex rounded-full border border-stone-200 px-4 py-2 text-sm font-black text-leaf"
                onClick={() => setSearchQuery("")}
                type="button"
              >
                {t.clearSearch}
              </button>
            </div>
          ) : categoriesWithItems.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center shadow-sm">
              <h2 className="text-lg font-black text-ink">{t.menuBeingPrepared}</h2>
              <p className="mt-2 text-sm text-stone-500">
                {t.menuBeingPreparedHint}
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
                <h2 className="text-xl font-black text-ink">
                  {language === "ar" && category.name_ar ? category.name_ar : category.name}
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  {availableItemCount} {availableItemCount > 1 ? t.itemsAvailable : t.itemAvailable}
                </p>
              </div>

              <div className="space-y-3">
                {categoryItems.map((item) => {
                  const activeOffer = offersByItemId.get(item.id) ?? null;
                  const hasOptions =
                    (resolvedGroupsByItemId.get(item.id) ?? []).length > 0;
                  // Optionless items keep the single-line stepper; option-ful
                  // items get an Add button + aggregate badge (their lines are
                  // managed per configuration in the checkout summary).
                  const plainLineKey = activeOffer
                    ? cartLineKey({ item_id: item.id, offer_id: activeOffer.id })
                    : cartLineKey({ item_id: item.id });

                  return (
                    <MenuItemCard
                      key={item.id}
                      activeOffer={activeOffer}
                      cartLine={hasOptions ? undefined : linesByKey.get(plainLineKey)}
                      hasOptions={hasOptions}
                      item={item}
                      language={language}
                      offerQuantity={
                        activeOffer ? quantityByOfferId.get(activeOffer.id) ?? 0 : 0
                      }
                      onAddItem={cart.addItem}
                      onAddOffer={cart.addOffer}
                      onDecrement={cart.decrement}
                      onIncrement={cart.increment}
                      onIncrementOffer={cart.incrementOffer}
                      onOpenOptions={openOptionsSheet}
                      orderingAvailable={orderingAvailable}
                      restaurant={restaurant}
                      totalQuantity={quantityByItemId.get(item.id) ?? 0}
                    />
                  );
                })}
              </div>
            </section>
          ))}

          {feedback.reviews.length > 0 ? (
            <section className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-ink">{t.customerReviews}</h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {t.verifiedFeedback}
                  </p>
                </div>
                {feedback.averageRating !== null ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-2 font-black text-amber-700">
                    <Star className="fill-current" size={16} />
                    {feedback.averageRating.toFixed(1)}
                  </span>
                ) : null}
              </div>
              <div className="mt-4 space-y-4">
                {feedback.reviews.map((review) => (
                  <article className="border-t border-stone-100 pt-4 first:border-t-0 first:pt-0" key={review.id}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-black">{review.customer_display_name}</p>
                      <div className="flex text-amber-400">
                        {Array.from({ length: review.rating }, (_, index) => (
                          <Star className="fill-current" key={index} size={14} />
                        ))}
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-stone-600">{review.comment}</p>
                    <p className="mt-2 text-xs font-bold text-leaf">{t.verifiedOrder}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </section>
      </main>

      <footer className="mx-auto w-full max-w-3xl px-4 pb-28 pt-2 text-center">
        <Link
          className="focus-ring inline-flex rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-black text-leaf shadow-sm"
          href="/jobs"
        >
          {language === "ar"
            ? "وظائف المطاعم في الإمارات"
            : "Restaurant jobs across the UAE"}
        </Link>
      </footer>

      {groupToken ? (
        <GroupOrderBar
          checkoutHref={checkoutHref}
          language={language}
          onLeave={() => setGroupLink(null)}
          restaurant={restaurant}
          token={groupToken}
        />
      ) : null}

      {isGroupStartOpen ? (
        <GroupOrderStart
          language={language}
          onClose={() => setIsGroupStartOpen(false)}
          onCreated={(token) => {
            setIsGroupStartOpen(false);
            setGroupLink(token);
          }}
          restaurant={restaurant}
        />
      ) : null}

      {cart.count > 0 && !groupToken ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10">
              <ShoppingBag size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black">
                {cart.count} {cart.count > 1 ? t.itemsInCart : t.itemInCart}
              </p>
              {!minimumReached ? (
                <p className="text-xs font-semibold text-white/70">
                  {language === "ar"
                    ? `أضف ${formatCurrency(amountRemaining, restaurant)} لإتمام الحد الأدنى`
                    : `Add ${formatCurrency(amountRemaining, restaurant)} to reach the minimum`}
                </p>
              ) : null}
            </div>
            {minimumReached ? (
              <Link
                href={checkoutHref}
                className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-black text-ink"
              >
                {t.viewCart}
                <span>{formatCurrency(cart.subtotal, restaurant)}</span>
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="inline-flex shrink-0 items-center rounded-full bg-white/15 px-4 py-2.5 text-sm font-black text-white/70"
              >
                {formatCurrency(cart.subtotal, restaurant)}
              </span>
            )}
          </div>
        </div>
      ) : null}

      {isCategorySheetOpen ? (
        <CategorySheet
          activeCategoryId={visibleActiveCategoryId}
          categories={categoriesWithItems}
          language={language}
          onClose={() => setIsCategorySheetOpen(false)}
          onSelect={scrollToCategory}
        />
      ) : null}

      {optionsSheet ? (
        <ItemOptionsSheet
          basePrice={
            optionsSheet.offer
              ? optionsSheet.offer.promotional_price
              : optionsSheet.item.price
          }
          groups={resolvedGroupsByItemId.get(optionsSheet.item.id) ?? []}
          item={optionsSheet.item}
          language={language}
          maxQuantity={
            optionsSheet.offer
              ? Math.max(
                  0,
                  optionsSheet.offer.max_quantity_per_order -
                    offerQuantityInCart(optionsSheet.offer.id)
                )
              : undefined
          }
          offer={optionsSheet.offer}
          restaurant={restaurant}
          onAdd={(options, quantity) => {
            cart.addConfiguredLine({
              item: optionsSheet.item,
              offer: optionsSheet.offer,
              options,
              quantity
            });
            setOptionsSheet(null);
          }}
          onClose={() => setOptionsSheet(null)}
        />
      ) : null}
    </div>
  );
}
