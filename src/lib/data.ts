import { unstable_cache } from "next/cache";
import { getSupabase, getSupabaseAdmin } from "@/lib/supabase";
import {
  getRestaurantDateKey,
  getRestaurantMonthStartIso,
  isSameUaeCalendarDay
} from "@/lib/date-time";
import { isOfferOrderable } from "@/lib/order-pricing";
import {
  PUBLIC_CACHE_TTL_SECONDS,
  publicMenuTag,
  publicRestaurantTag
} from "@/lib/public-cache";
import {
  computeCommissionKept,
  type CommissionKept,
  type CommissionKeptTotals
} from "@/lib/commission";
import {
  classifyCustomerSegment,
  isCustomerContactable,
  matchesSegmentFilter,
  type CustomerSegmentFilter
} from "@/lib/customer-insights";
import {
  demoCategories,
  demoCustomers,
  demoItems,
  demoOrders,
  demoRestaurant
} from "@/lib/demo-data";
import type {
  Analytics,
  Customer,
  DashboardTrend,
  DashboardTrendRange,
  MenuCategory,
  MenuItem,
  MenuItemOptionGroupLink,
  MenuOffer,
  MenuOption,
  MenuOptionCatalog,
  MenuOptionGroup,
  MenuWithCategories,
  Order,
  OrderStatus,
  FulfilmentType,
  PublicRestaurant,
  Restaurant
} from "@/lib/types";

const defaultSlug = process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG ?? "chaixpress";
const demoDataEnabled =
  process.env.NODE_ENV !== "production" || process.env.ENABLE_DEMO_DATA === "true";
const activeOrderStatuses: OrderStatus[] = [
  "New",
  "Accepted",
  "Preparing",
  "Ready to Serve",
  "Out for Delivery"
];
const maxSynchronousReportOrders = 10_000;

// Explicit column list for order *list/report* reads. Mirrors the Order type
// minus `whatsapp_message` — a large text column that is only needed when
// (re)building a single order's WhatsApp link/ticket, and is never rendered in
// any list or report. Selecting it on list/report paths wastes payload that
// grows with order volume, so those reads use this projection instead of "*".
const orderListColumns = [
  "id",
  "restaurant_id",
  "parent_order_id",
  "shift_id",
  "customer_name",
  "customer_phone",
  "fulfilment_type",
  "car_plate_number",
  "car_description",
  "table_number",
  "delivery_area",
  "delivery_address",
  "delivery_latitude",
  "delivery_longitude",
  "delivery_google_maps_url",
  "delivery_place_id",
  "delivery_address_text",
  "delivery_landmark",
  "notes",
  "payment_method",
  "items",
  "subtotal",
  "delivery_fee",
  "total",
  "points_earned",
  "points_redeemed",
  "loyalty_discount",
  "status",
  "source",
  "consent_order_processing",
  "consent_marketing",
  "consent_timestamp",
  "created_at",
  "updated_at"
].join(", ");

export type OrderStatusView = "active" | "completed" | "cancelled";
export type OrderFulfilmentView = "all" | FulfilmentType;

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type OrderFulfilmentCounts = Record<OrderFulfilmentView, number>;

type OrdersPageOptions = {
  fulfilment?: OrderFulfilmentView;
  page?: number;
  pageSize?: number;
  status?: OrderStatusView;
};

type CustomersPageOptions = {
  page?: number;
  pageSize?: number;
};

function normalizePagination(page = 1, pageSize = 25) {
  const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const safePageSize = Number.isFinite(pageSize)
    ? Math.min(100, Math.max(1, Math.floor(pageSize)))
    : 25;

  return {
    from: (safePage - 1) * safePageSize,
    page: safePage,
    pageSize: safePageSize,
    to: safePage * safePageSize - 1
  };
}

function orderMatchesStatusView(order: Order, status: OrderStatusView) {
  if (status === "completed") {
    return order.status === "Completed";
  }

  if (status === "cancelled") {
    return order.status === "Cancelled";
  }

  return activeOrderStatuses.includes(order.status);
}

function applyOrderStatusFilter<T extends {
  eq: (column: string, value: string) => T;
  in: (column: string, values: readonly string[]) => T;
}>(query: T, status: OrderStatusView) {
  if (status === "completed") {
    return query.eq("status", "Completed");
  }

  if (status === "cancelled") {
    return query.eq("status", "Cancelled");
  }

  return query.in("status", activeOrderStatuses);
}

function productionDataFailure(resource: string, error?: { message?: string } | null): never {
  console.error("WhatsOrder production data read failed", {
    resource,
    message: error?.message ?? "Supabase is not configured"
  });

  throw new Error(
    `${resource} could not be loaded from Supabase.${error?.message ? ` ${error.message}` : ""}`
  );
}

function toPublicRestaurant(restaurant: Restaurant): PublicRestaurant {
  return {
    id: restaurant.id,
    name: restaurant.name,
    name_ar: restaurant.name_ar,
    slug: restaurant.slug,
    logo_url: restaurant.logo_url,
    cover_image_url: restaurant.cover_image_url,
    whatsapp_number: restaurant.whatsapp_number,
    address: restaurant.address,
    city: restaurant.city,
    subtitle: restaurant.subtitle,
    address_ar: restaurant.address_ar,
    subtitle_ar: restaurant.subtitle_ar,
    delivery_fee: restaurant.delivery_fee,
    minimum_order_amount: restaurant.minimum_order_amount,
    pickup_enabled: restaurant.pickup_enabled,
    car_pickup_enabled: restaurant.car_pickup_enabled,
    dine_in_enabled: restaurant.dine_in_enabled,
    delivery_enabled: restaurant.delivery_enabled,
    scheduled_orders_enabled: restaurant.scheduled_orders_enabled,
    public_reviews_enabled: restaurant.public_reviews_enabled,
    accepting_orders: restaurant.accepting_orders,
    opening_hours_enabled: restaurant.opening_hours_enabled,
    opening_hours: restaurant.opening_hours,
    country_code: restaurant.country_code,
    currency_code: restaurant.currency_code,
    locale: restaurant.locale,
    phone_country_code: restaurant.phone_country_code,
    time_zone: restaurant.time_zone,
    is_demo: restaurant.is_demo,
    demo_expires_at: restaurant.demo_expires_at
  };
}

// Cached public-restaurant read. Failures throw so they are never cached;
// only real lookups (found or not-found) are stored, and admin edits
// revalidate the tag immediately.
const fetchPublicRestaurant = (slug: string) =>
  unstable_cache(
    async (): Promise<PublicRestaurant | null> => {
      const supabase = getSupabase();

      if (!supabase) {
        throw new Error("Supabase is not configured");
      }

      const { data, error } = await supabase
        .rpc("get_public_restaurant", { target_slug: slug })
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        throw new Error(error.message);
      }

      return (data as PublicRestaurant | null) ?? null;
    },
    ["public-restaurant", slug],
    { revalidate: PUBLIC_CACHE_TTL_SECONDS, tags: [publicRestaurantTag(slug)] }
  )();

export async function getRestaurantBySlug(
  slug: string
): Promise<PublicRestaurant | null> {
  try {
    const restaurant = await fetchPublicRestaurant(slug);

    if (restaurant) {
      return restaurant;
    }
  } catch (error) {
    if (!demoDataEnabled) {
      productionDataFailure(
        "Restaurant",
        error instanceof Error ? error : undefined
      );
    }
  }

  if (demoDataEnabled && slug === demoRestaurant.slug) {
    return toPublicRestaurant(demoRestaurant);
  }

  return null;
}

export async function getDefaultRestaurant() {
  return getRestaurantBySlug(defaultSlug);
}

type GetMenuOptions = {
  admin?: boolean;
};

async function readMenu(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  restaurantId: string
): Promise<MenuWithCategories | null> {
  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("display_order"),
    supabase
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: true })
  ]);

  if (!categories || !items) {
    return null;
  }

  return {
    categories: categories as MenuCategory[],
    items: items as MenuItem[]
  };
}

// Cached public-menu read for the customer path (menu page + order
// re-pricing). Admin reads stay uncached so the editor always sees live data.
// Failures throw so they are never cached; menu edits revalidate the tag.
const fetchPublicMenu = (restaurantId: string) =>
  unstable_cache(
    async (): Promise<MenuWithCategories> => {
      const supabase = getSupabase();

      if (!supabase) {
        throw new Error("Supabase is not configured");
      }

      const menu = await readMenu(supabase, restaurantId);

      if (!menu) {
        throw new Error("Menu could not be read");
      }

      return menu;
    },
    ["public-menu", restaurantId],
    { revalidate: PUBLIC_CACHE_TTL_SECONDS, tags: [publicMenuTag(restaurantId)] }
  )();

export async function getMenu(
  restaurantId: string,
  options: GetMenuOptions = {}
): Promise<MenuWithCategories> {
  if (options.admin) {
    const supabase = getSupabaseAdmin();
    const menu = supabase ? await readMenu(supabase, restaurantId) : null;

    if (menu) {
      return menu;
    }

    if (!demoDataEnabled) {
      productionDataFailure("Menu");
    }
  } else {
    try {
      return await fetchPublicMenu(restaurantId);
    } catch (error) {
      if (!demoDataEnabled) {
        productionDataFailure("Menu", error instanceof Error ? error : undefined);
      }
    }
  }

  return {
    categories: demoCategories.filter((category) => category.restaurant_id === restaurantId),
    items: demoItems.filter((item) => item.restaurant_id === restaurantId)
  };
}

function normalizeMenuOffers(rows: Record<string, unknown>[]): MenuOffer[] {
  return rows.map((offer) => ({
    ...offer,
    promotional_price: Number(offer.promotional_price),
    max_quantity_per_order: Number(offer.max_quantity_per_order ?? 1)
  })) as MenuOffer[];
}

// Cached active-offer read for the customer path. The starts_at/ends_at
// window is enforced OUTSIDE the cache (below) so a cached list can never
// keep selling an offer past its end time.
const fetchPublicMenuOffers = (restaurantId: string) =>
  unstable_cache(
    async (): Promise<MenuOffer[]> => {
      const supabase = getSupabase();

      if (!supabase) {
        throw new Error("Supabase is not configured");
      }

      const { data, error } = await supabase
        .from("menu_offers")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("display_order")
        .order("created_at");

      if (error || !data) {
        throw new Error(error?.message ?? "Menu offers could not be read");
      }

      return normalizeMenuOffers(data);
    },
    ["public-menu-offers", restaurantId],
    { revalidate: PUBLIC_CACHE_TTL_SECONDS, tags: [publicMenuTag(restaurantId)] }
  )();

export async function getMenuOffers(
  restaurantId: string,
  options: GetMenuOptions = {}
): Promise<MenuOffer[]> {
  if (options.admin) {
    const supabase = getSupabaseAdmin();

    if (!supabase) {
      if (!demoDataEnabled) {
        productionDataFailure("Menu offers");
      }
      return [];
    }

    const { data, error } = await supabase
      .from("menu_offers")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("display_order")
      .order("created_at");

    if (!error && data) {
      return normalizeMenuOffers(data);
    }

    if (!demoDataEnabled) {
      productionDataFailure("Menu offers", error);
    }

    return [];
  }

  try {
    const offers = await fetchPublicMenuOffers(restaurantId);
    // Customer-facing: only offers inside their date window are shown or
    // priced. Expired-but-still-active offers no longer display or sell.
    return offers.filter((offer) => isOfferOrderable(offer));
  } catch (error) {
    if (!demoDataEnabled) {
      productionDataFailure(
        "Menu offers",
        error instanceof Error ? error : undefined
      );
    }
    return [];
  }
}

const EMPTY_OPTION_CATALOG: MenuOptionCatalog = {
  groups: [],
  options: [],
  links: []
};

async function readOptionCatalog(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  restaurantId: string
): Promise<MenuOptionCatalog | null> {
  const [{ data: groups }, { data: options }, { data: links }] =
    await Promise.all([
      supabase
        .from("menu_option_groups")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("display_order"),
      supabase
        .from("menu_options")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("display_order"),
      supabase
        .from("menu_item_option_groups")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("display_order")
    ]);

  if (!groups || !options || !links) {
    return null;
  }

  return {
    // numeric/int columns arrive as strings from PostgREST — normalize once.
    groups: groups.map((group) => ({
      ...group,
      min_select: Number(group.min_select ?? 0),
      max_select: group.max_select === null ? null : Number(group.max_select),
      display_order: Number(group.display_order ?? 0)
    })) as MenuOptionGroup[],
    options: options.map((option) => ({
      ...option,
      price_delta: Number(option.price_delta ?? 0),
      display_order: Number(option.display_order ?? 0)
    })) as MenuOption[],
    links: links.map((link) => ({
      ...link,
      display_order: Number(link.display_order ?? 0)
    })) as MenuItemOptionGroupLink[]
  };
}

// Cached public option-catalog read for the customer path (menu sheet + order
// re-pricing). RLS hides unavailable options from anon, which the customer
// verification path relies on. Admin reads stay uncached and see everything.
const fetchPublicOptionCatalog = (restaurantId: string) =>
  unstable_cache(
    async (): Promise<MenuOptionCatalog> => {
      const supabase = getSupabase();

      if (!supabase) {
        throw new Error("Supabase is not configured");
      }

      const catalog = await readOptionCatalog(supabase, restaurantId);

      if (!catalog) {
        throw new Error("Menu options could not be read");
      }

      return catalog;
    },
    ["public-menu-options", restaurantId],
    { revalidate: PUBLIC_CACHE_TTL_SECONDS, tags: [publicMenuTag(restaurantId)] }
  )();

export async function getMenuOptionCatalog(
  restaurantId: string,
  options: GetMenuOptions = {}
): Promise<MenuOptionCatalog> {
  if (options.admin) {
    const supabase = getSupabaseAdmin();
    const catalog = supabase
      ? await readOptionCatalog(supabase, restaurantId)
      : null;

    if (catalog) {
      return catalog;
    }

    if (!demoDataEnabled) {
      productionDataFailure("Menu options");
    }

    return EMPTY_OPTION_CATALOG;
  }

  try {
    return await fetchPublicOptionCatalog(restaurantId);
  } catch (error) {
    // Un-migrated deployments have no option tables yet — options are an
    // additive feature, so degrade to "no options" instead of failing the
    // menu or order path.
    console.error("WhatsOrder option catalog read failed", {
      restaurantId,
      message: error instanceof Error ? error.message : "unknown"
    });
    return EMPTY_OPTION_CATALOG;
  }
}

export async function getRecentOrders(
  restaurantId: string,
  limit = 5
): Promise<Order[]> {
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data, error } = await supabase
      .from("orders")
      .select(orderListColumns)
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(Math.min(20, Math.max(1, limit)));

    if (!error && data) {
      return data as unknown as Order[];
    }

    if (!demoDataEnabled) {
      productionDataFailure("Recent orders", error);
    }
  } else if (!demoDataEnabled) {
    productionDataFailure("Recent orders");
  }

  return demoOrders
    .filter((order) => order.restaurant_id === restaurantId)
    .toSorted((first, second) => second.created_at.localeCompare(first.created_at))
    .slice(0, limit);
}

export async function getOrderForAdmin(
  restaurantId: string,
  orderId: string
): Promise<Order | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return (
      demoOrders.find(
        (order) => order.id === orderId && order.restaurant_id === restaurantId
      ) ?? null
    );
  }

  const { data, error } = await supabase
    .from("orders")
    .select(orderListColumns)
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (error) {
    productionDataFailure("Order", error);
  }

  return (data as unknown as Order | null) ?? null;
}

export type DailySummaryCardData = {
  summary_date: string;
  status: string;
  message_text: string | null;
  numbers: import("@/lib/daily-summary/types").DailyNumbers | null;
};

/**
 * The most recent daily insight recap for this restaurant, or null if none has
 * run yet / the table isn't reachable. Soft feature: absence simply hides the
 * dashboard card. Always tenant-scoped by restaurant id.
 */
export async function getLatestDailySummary(
  restaurantId: string
): Promise<DailySummaryCardData | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("daily_summary_runs")
    .select("summary_date, status, message_text, numbers")
    .eq("restaurant_id", restaurantId)
    .order("summary_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as DailySummaryCardData;
}

export async function getDashboardAnalytics(
  restaurantId: string
): Promise<Analytics> {
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data, error } = await supabase.rpc(
      "get_restaurant_dashboard_analytics",
      { target_restaurant_id: restaurantId }
    );

    if (!error && data) {
      const metrics = data as Record<string, string | number>;
      return {
        averageOrderValue: Number(metrics.averageOrderValue ?? 0),
        completedOrders: Number(metrics.completedOrders ?? 0),
        newOrders: Number(metrics.newOrders ?? 0),
        repeatCustomers: Number(metrics.repeatCustomers ?? 0),
        todaysOrders: Number(metrics.todaysOrders ?? 0),
        todaysRevenue: Number(metrics.todaysRevenue ?? 0),
        topSellingItem: String(metrics.topSellingItem ?? "No sales yet")
      };
    }

    if (!demoDataEnabled) {
      productionDataFailure("Dashboard analytics", error);
    }
  } else if (!demoDataEnabled) {
    productionDataFailure("Dashboard analytics");
  }

  return getAnalytics(
    demoOrders.filter((order) => order.restaurant_id === restaurantId),
    demoCustomers.filter((customer) => customer.restaurant_id === restaurantId)
  );
}

export async function getDashboardTrend(
  restaurantId: string,
  range: DashboardTrendRange = "7d"
): Promise<DashboardTrend> {
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data, error } = await supabase.rpc(
      "get_restaurant_dashboard_trend",
      { target_restaurant_id: restaurantId, range_mode: range }
    );

    if (!error && data) {
      const trend = data as Record<string, unknown>;
      const rawDays = Array.isArray(trend.days) ? trend.days : [];
      return {
        days: rawDays.map((rawDay) => {
          const day = rawDay as Record<string, string | number>;
          return {
            date: String(day.date ?? ""),
            orders: Number(day.orders ?? 0),
            sales: Number(day.sales ?? 0)
          };
        }),
        monthOrders: Number(trend.monthOrders ?? 0),
        monthSales: Number(trend.monthSales ?? 0),
        inProgressOrders: Number(trend.inProgressOrders ?? 0),
        topItem: typeof trend.topItem === "string" ? trend.topItem : null,
        topItemQuantity: Number(trend.topItemQuantity ?? 0)
      };
    }

    if (!demoDataEnabled) {
      productionDataFailure("Dashboard trend", error);
    }
  } else if (!demoDataEnabled) {
    productionDataFailure("Dashboard trend");
  }

  return getDashboardTrendFromOrders(
    demoOrders.filter((order) => order.restaurant_id === restaurantId),
    range
  );
}

export async function getCommissionKept(
  restaurant: Pick<
    Restaurant,
    | "id"
    | "commission_rate"
    | "country_code"
    | "currency_code"
    | "locale"
    | "phone_country_code"
    | "time_zone"
  >
): Promise<CommissionKept> {
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data, error } = await supabase.rpc(
      "get_restaurant_commission_kept",
      { target_restaurant_id: restaurant.id }
    );

    if (!error && data) {
      const totals = data as Record<string, string | number>;
      return computeCommissionKept(
        {
          monthOrders: Number(totals.monthOrders ?? 0),
          monthBase: Number(totals.monthBase ?? 0),
          allTimeOrders: Number(totals.allTimeOrders ?? 0),
          allTimeBase: Number(totals.allTimeBase ?? 0)
        },
        restaurant.commission_rate
      );
    }

    if (!demoDataEnabled) {
      productionDataFailure("Commission kept", error);
    }
  } else if (!demoDataEnabled) {
    productionDataFailure("Commission kept");
  }

  return computeCommissionKept(
    commissionKeptTotalsFromOrders(
      demoOrders.filter((order) => order.restaurant_id === restaurant.id),
      restaurant
    ),
    restaurant.commission_rate
  );
}

// Mirror of the get_restaurant_commission_kept RPC for the demo-data fallback:
// completed DELIVERY orders only, base = food subtotal (delivery fee excluded).
function commissionKeptTotalsFromOrders(
  orders: Order[],
  restaurant: Pick<Restaurant, "country_code" | "currency_code" | "locale" | "phone_country_code" | "time_zone">
): CommissionKeptTotals {
  const monthStartIso = getRestaurantMonthStartIso(new Date(), restaurant);
  let monthOrders = 0;
  let monthBase = 0;
  let allTimeOrders = 0;
  let allTimeBase = 0;

  for (const order of orders) {
    if (order.fulfilment_type !== "delivery" || order.status !== "Completed") {
      continue;
    }

    const base = Number(order.subtotal) || 0;
    allTimeOrders += 1;
    allTimeBase += base;

    if (order.created_at >= monthStartIso) {
      monthOrders += 1;
      monthBase += base;
    }
  }

  return { monthOrders, monthBase, allTimeOrders, allTimeBase };
}

export async function getOrdersForReport(
  restaurantId: string,
  startIso: string,
  endExclusiveIso: string
): Promise<Order[]> {
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data, error } = await supabase
      .from("orders")
      .select(orderListColumns)
      .eq("restaurant_id", restaurantId)
      .gte("created_at", startIso)
      .lt("created_at", endExclusiveIso)
      .order("created_at", { ascending: true })
      .limit(maxSynchronousReportOrders + 1);

    if (!error && data) {
      if (data.length > maxSynchronousReportOrders) {
        throw new Error(
          "This report contains too many orders for a synchronous export. Choose a shorter range."
        );
      }
      return data as unknown as Order[];
    }

    if (!demoDataEnabled) {
      productionDataFailure("Report orders", error);
    }
  } else if (!demoDataEnabled) {
    productionDataFailure("Report orders");
  }

  return demoOrders.filter(
    (order) =>
      order.restaurant_id === restaurantId &&
      order.created_at >= startIso &&
      order.created_at < endExclusiveIso
  );
}

export async function getCustomersForReport(
  restaurantId: string,
  phones: string[]
): Promise<Customer[]> {
  const uniquePhones = [...new Set(phones.filter(Boolean))];

  if (uniquePhones.length === 0) {
    return [];
  }

  const supabase = getSupabaseAdmin();

  if (supabase) {
    const chunks: string[][] = [];

    for (let index = 0; index < uniquePhones.length; index += 100) {
      chunks.push(uniquePhones.slice(index, index + 100));
    }

    const customers: Customer[] = [];
    let customerQueryFailed = false;

    for (const phoneChunk of chunks) {
      const result = await supabase
        .from("customers")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .in("phone", phoneChunk);

      if (result.error) {
        customerQueryFailed = true;
        if (!demoDataEnabled) {
          productionDataFailure("Report customers", result.error);
        }
        break;
      }

      customers.push(...((result.data ?? []) as Customer[]));
    }

    if (!customerQueryFailed) {
      return customers;
    }
  } else if (!demoDataEnabled) {
    productionDataFailure("Report customers");
  }

  return demoCustomers.filter(
    (customer) =>
      customer.restaurant_id === restaurantId &&
      uniquePhones.includes(customer.phone)
  );
}

export async function getOrdersPage(
  restaurantId: string,
  options: OrdersPageOptions = {}
): Promise<PaginatedResult<Order>> {
  const {
    fulfilment = "all",
    status = "active"
  } = options;
  const { from, page, pageSize, to } = normalizePagination(options.page, options.pageSize);
  const supabase = getSupabaseAdmin();

  if (supabase) {
    let query = supabase
      .from("orders")
      // count: "estimated" returns an exact count while a tenant's matching
      // rows stay below PostgREST's threshold (verified identical to "exact"
      // at current volume) and switches to a planner estimate only once the
      // set is large enough that an exact COUNT would scan O(n) per page load.
      .select(orderListColumns, { count: "estimated" })
      .eq("restaurant_id", restaurantId);

    query = applyOrderStatusFilter(query, status);

    if (fulfilment !== "all") {
      query = query.eq("fulfilment_type", fulfilment);
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: status === "active" })
      .range(from, to);

    if (!error && data) {
      const total = count ?? 0;

      return {
        items: data as unknown as Order[],
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      };
    }

    if (!demoDataEnabled) {
      productionDataFailure("Orders page", error);
    }
  } else if (!demoDataEnabled) {
    productionDataFailure("Orders page");
  }

  const filteredOrders = demoOrders
    .filter((order) => order.restaurant_id === restaurantId)
    .filter((order) => orderMatchesStatusView(order, status))
    .filter((order) => fulfilment === "all" || order.fulfilment_type === fulfilment)
    .toSorted((a, b) =>
      status === "active"
        ? a.created_at.localeCompare(b.created_at)
        : b.created_at.localeCompare(a.created_at)
    );
  const items = filteredOrders.slice(from, to + 1);

  return {
    items,
    page,
    pageSize,
    total: filteredOrders.length,
    totalPages: Math.ceil(filteredOrders.length / pageSize)
  };
}

export async function getOrderFulfilmentCounts(
  restaurantId: string,
  status: OrderStatusView
): Promise<OrderFulfilmentCounts> {
  const supabase = getSupabaseAdmin();
  const fulfilmentTypes: FulfilmentType[] = [
    "delivery",
    "takeaway",
    "dine_in",
    "car_pickup"
  ];

  if (supabase) {
    const countForFulfilment = async (fulfilment?: FulfilmentType) => {
      let query = supabase
        .from("orders")
        // Estimated keeps these tab badges exact at current volume and avoids
        // five O(n) COUNTs per orders-page load once a tenant grows large.
        .select("id", { count: "estimated", head: true })
        .eq("restaurant_id", restaurantId);

      query = applyOrderStatusFilter(query, status);

      if (fulfilment) {
        query = query.eq("fulfilment_type", fulfilment);
      }

      const { count, error } = await query;

      if (error) {
        throw error;
      }

      return count ?? 0;
    };

    try {
      const [all, delivery, takeaway, dineIn, carPickup] = await Promise.all([
        countForFulfilment(),
        ...fulfilmentTypes.map((fulfilment) => countForFulfilment(fulfilment))
      ]);

      return {
        all,
        delivery,
        takeaway,
        dine_in: dineIn,
        car_pickup: carPickup
      };
    } catch (error) {
      if (!demoDataEnabled) {
        productionDataFailure(
          "Order fulfilment counts",
          error instanceof Error ? error : undefined
        );
      }
    }
  } else if (!demoDataEnabled) {
    productionDataFailure("Order fulfilment counts");
  }

  const matchingOrders = demoOrders
    .filter((order) => order.restaurant_id === restaurantId)
    .filter((order) => orderMatchesStatusView(order, status));

  return {
    all: matchingOrders.length,
    delivery: matchingOrders.filter((order) => order.fulfilment_type === "delivery").length,
    takeaway: matchingOrders.filter((order) => order.fulfilment_type === "takeaway").length,
    dine_in: matchingOrders.filter((order) => order.fulfilment_type === "dine_in").length,
    car_pickup: matchingOrders.filter((order) => order.fulfilment_type === "car_pickup").length
  };
}

export async function getNewOrderCount(restaurantId: string): Promise<number> {
  const state = await getNewOrderAlertState(restaurantId);
  return state.newOrderCount;
}

export type NewOrderAlertState = {
  newOrderCount: number;
  pendingOrderIds: string[];
};

export async function getNewOrderAlertState(
  restaurantId: string
): Promise<NewOrderAlertState> {
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const [{ count, error: countError }, { data, error: ordersError }] =
      await Promise.all([
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId)
          .eq("status", "New"),
        supabase
          .from("orders")
          .select("id")
          .eq("restaurant_id", restaurantId)
          .eq("status", "New")
          .order("created_at", { ascending: false })
          .limit(100)
      ]);

    if (!countError && !ordersError) {
      return {
        newOrderCount: count ?? 0,
        pendingOrderIds: (data ?? []).map((order) => String(order.id))
      };
    }

    if (!demoDataEnabled) {
      productionDataFailure("New-order alert state", countError ?? ordersError);
    }
  } else if (!demoDataEnabled) {
    productionDataFailure("New-order alert state");
  }

  const newOrders = demoOrders.filter(
    (order) => order.restaurant_id === restaurantId && order.status === "New"
  );

  return {
    newOrderCount: newOrders.length,
    pendingOrderIds: newOrders.slice(0, 100).map((order) => order.id)
  };
}

export async function getCustomersPage(
  restaurantId: string,
  options: CustomersPageOptions = {}
): Promise<PaginatedResult<Customer>> {
  const { from, page, pageSize, to } = normalizePagination(options.page, options.pageSize);
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data, error, count } = await supabase
      .from("customers")
      .select("*", { count: "exact" })
      .eq("restaurant_id", restaurantId)
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (!error && data) {
      const total = count ?? 0;

      return {
        items: data as Customer[],
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      };
    }

    if (!demoDataEnabled) {
      productionDataFailure("Customers page", error);
    }
  } else if (!demoDataEnabled) {
    productionDataFailure("Customers page");
  }

  const customers = demoCustomers
    .filter((customer) => customer.restaurant_id === restaurantId)
    .toSorted((a, b) => b.updated_at.localeCompare(a.updated_at));
  const items = customers.slice(from, to + 1);

  return {
    items,
    page,
    pageSize,
    total: customers.length,
    totalPages: Math.ceil(customers.length / pageSize)
  };
}

export type CustomerSegmentSummary = {
  total: number;
  repeat: number;
  vip: number;
  inactive: number;
  marketing_opt_in: number;
};

export type CustomerSegmentPage = {
  items: Customer[];
  page: number;
  pageSize: number;
  matched: number;
  contactable: number;
  totalPages: number;
  summary: CustomerSegmentSummary;
};

type CustomerSegmentsOptions = {
  segment?: CustomerSegmentFilter;
  search?: string;
  page?: number;
  pageSize?: number;
};

// Campaign-ready customer segment page. Production reads go through the
// tenant-scoped get_customer_segment_page RPC (one round-trip: summary counts +
// matched/contactable counts + the paginated rows). The demo fallback mirrors
// the same rules in memory using the shared customer-insights helpers.
export async function getCustomerSegments(
  restaurantId: string,
  options: CustomerSegmentsOptions = {}
): Promise<CustomerSegmentPage> {
  const segment: CustomerSegmentFilter = options.segment ?? "all";
  const search = options.search?.trim() || null;
  const { page, pageSize } = normalizePagination(options.page, options.pageSize);
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data, error } = await supabase.rpc("get_customer_segment_page", {
      p_restaurant_id: restaurantId,
      p_segment: segment,
      p_search: search,
      p_page: page,
      p_page_size: pageSize
    });

    if (!error && data) {
      const payload = data as {
        items: Customer[];
        matched: number;
        contactable_matched: number;
        summary: CustomerSegmentSummary;
        pagination: { page: number; page_size: number; total_pages: number };
      };

      return {
        items: payload.items ?? [],
        page: payload.pagination?.page ?? page,
        pageSize: payload.pagination?.page_size ?? pageSize,
        matched: payload.matched ?? 0,
        contactable: payload.contactable_matched ?? 0,
        totalPages: payload.pagination?.total_pages ?? 0,
        summary: payload.summary ?? {
          total: 0,
          repeat: 0,
          vip: 0,
          inactive: 0,
          marketing_opt_in: 0
        }
      };
    }

    if (!demoDataEnabled) {
      productionDataFailure("Customer segments", error);
    }
  } else if (!demoDataEnabled) {
    productionDataFailure("Customer segments");
  }

  return segmentCustomersInMemory(restaurantId, segment, search, page, pageSize);
}

// Demo/dev fallback: reproduce the RPC over the in-memory demo dataset so the
// segment page keeps working without Supabase.
function segmentCustomersInMemory(
  restaurantId: string,
  segment: CustomerSegmentFilter,
  search: string | null,
  page: number,
  pageSize: number
): CustomerSegmentPage {
  const now = new Date();
  const customers = demoCustomers.filter(
    (customer) => customer.restaurant_id === restaurantId
  );
  const ordersByPhone = new Map<string, Order[]>();

  for (const order of demoOrders) {
    if (order.restaurant_id !== restaurantId) {
      continue;
    }

    const bucket = ordersByPhone.get(order.customer_phone) ?? [];
    bucket.push(order);
    ordersByPhone.set(order.customer_phone, bucket);
  }

  const summary: CustomerSegmentSummary = {
    total: customers.length,
    repeat: 0,
    vip: 0,
    inactive: 0,
    marketing_opt_in: 0
  };

  for (const customer of customers) {
    const lifecycle = classifyCustomerSegment(customer, now);
    if (lifecycle === "Repeat") summary.repeat += 1;
    if (lifecycle === "VIP") summary.vip += 1;
    if (lifecycle === "Inactive") summary.inactive += 1;
    if (isCustomerContactable(customer)) summary.marketing_opt_in += 1;
  }

  const needle = search?.toLowerCase() ?? null;
  const matched = customers
    .filter((customer) => {
      if (
        needle &&
        !customer.name.toLowerCase().includes(needle) &&
        !customer.phone.toLowerCase().includes(needle)
      ) {
        return false;
      }

      return matchesSegmentFilter(
        segment,
        customer,
        ordersByPhone.get(customer.phone) ?? [],
        now
      );
    })
    .toSorted((a, b) => b.updated_at.localeCompare(a.updated_at));

  const contactable = matched.filter((customer) => isCustomerContactable(customer)).length;
  const from = (page - 1) * pageSize;

  return {
    items: matched.slice(from, from + pageSize),
    page,
    pageSize,
    matched: matched.length,
    contactable,
    totalPages: Math.ceil(matched.length / pageSize),
    summary
  };
}

export async function getCustomersByPhones(
  restaurantId: string,
  phones: string[]
): Promise<Customer[]> {
  const uniquePhones = [...new Set(phones.filter(Boolean))];

  if (uniquePhones.length === 0) {
    return [];
  }

  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .in("phone", uniquePhones);

    if (!error && data) {
      return data as Customer[];
    }

    if (!demoDataEnabled) {
      productionDataFailure("Order customers", error);
    }
  } else if (!demoDataEnabled) {
    productionDataFailure("Order customers");
  }

  return demoCustomers.filter(
    (customer) =>
      customer.restaurant_id === restaurantId && uniquePhones.includes(customer.phone)
  );
}

export async function getOrdersForCustomerPhones(
  restaurantId: string,
  phones: string[]
): Promise<Order[]> {
  const uniquePhones = [...new Set(phones.filter(Boolean))];

  if (uniquePhones.length === 0) {
    return [];
  }

  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data, error } = await supabase
      .from("orders")
      .select(orderListColumns)
      .eq("restaurant_id", restaurantId)
      .in("customer_phone", uniquePhones)
      .order("created_at", { ascending: false });

    if (!error && data) {
      return data as unknown as Order[];
    }

    if (!demoDataEnabled) {
      productionDataFailure("Customer order histories", error);
    }
  } else if (!demoDataEnabled) {
    productionDataFailure("Customer order histories");
  }

  return demoOrders
    .filter(
      (order) =>
        order.restaurant_id === restaurantId && uniquePhones.includes(order.customer_phone)
    )
    .toSorted((a, b) => b.created_at.localeCompare(a.created_at));
}

export type OrderPaymentChange = {
  from: string | null;
  to: string;
  role: string | null;
  at: string;
};

export async function getOrderPaymentChanges(
  restaurantId: string,
  orderIds: string[]
): Promise<Record<string, OrderPaymentChange>> {
  const uniqueIds = [...new Set(orderIds.filter(Boolean))];

  if (uniqueIds.length === 0) {
    return {};
  }

  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return {};
  }

  const { data, error } = await supabase
    .from("order_payment_events")
    .select("order_id, from_method, to_method, actor_role, created_at")
    .eq("restaurant_id", restaurantId)
    .in("order_id", uniqueIds)
    .order("created_at", { ascending: false });

  // Table may not exist yet on un-migrated deployments — fail soft.
  if (error || !data) {
    return {};
  }

  const changes: Record<string, OrderPaymentChange> = {};

  for (const row of data) {
    const orderId = String(row.order_id);
    if (!changes[orderId]) {
      changes[orderId] = {
        from: row.from_method ?? null,
        to: String(row.to_method),
        role: row.actor_role ?? null,
        at: String(row.created_at)
      };
    }
  }

  return changes;
}

// Mirror of the get_restaurant_dashboard_trend RPC for the demo-data fallback.
// Day stepping uses fixed 24h increments, which is safe for the demo path (the
// pilot timezone has no DST) and never runs in production.
export function getDashboardTrendFromOrders(
  orders: Order[],
  range: DashboardTrendRange
): DashboardTrend {
  const now = new Date();
  const todayKey = getRestaurantDateKey(now);
  const windowDays =
    range === "30d" ? 30 : range === "mtd" ? Number(todayKey.slice(8, 10)) : 7;

  const dayKeys: string[] = [];
  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    dayKeys.push(getRestaurantDateKey(new Date(now.getTime() - offset * 86_400_000)));
  }

  const buckets = new Map(
    dayKeys.map((key) => [key, { orders: 0, sales: 0 }])
  );
  const itemCounts = new Map<string, number>();
  const monthPrefix = todayKey.slice(0, 7);
  let monthOrders = 0;
  let monthSales = 0;
  let inProgressOrders = 0;

  orders.forEach((order) => {
    const key = getRestaurantDateKey(order.created_at);
    const completed = order.status === "Completed";
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.orders += 1;
      if (completed) {
        bucket.sales += order.total;
        order.items.forEach((item) => {
          itemCounts.set(item.name, (itemCounts.get(item.name) ?? 0) + item.quantity);
        });
      }
    }
    if (key.startsWith(monthPrefix)) {
      monthOrders += 1;
      if (completed) {
        monthSales += order.total;
      }
    }
    if (order.status !== "New" && order.status !== "Completed" && order.status !== "Cancelled") {
      inProgressOrders += 1;
    }
  });

  const topEntry = [...itemCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    days: dayKeys.map((key) => ({
      date: key,
      orders: buckets.get(key)?.orders ?? 0,
      sales: buckets.get(key)?.sales ?? 0
    })),
    monthOrders,
    monthSales,
    inProgressOrders,
    topItem: topEntry?.[0] ?? null,
    topItemQuantity: topEntry?.[1] ?? 0
  };
}

export function getAnalytics(orders: Order[], customers: Customer[]): Analytics {
  const now = new Date();
  const todaysOrders = orders.filter((order) =>
    isSameUaeCalendarDay(order.created_at, now)
  );
  const completed = orders.filter((order) => order.status === "Completed");
  const completedToday = completed.filter((order) =>
    isSameUaeCalendarDay(order.created_at, now)
  );
  const itemCounts = new Map<string, number>();

  completed.forEach((order) => {
    order.items.forEach((item) => {
      itemCounts.set(item.name, (itemCounts.get(item.name) ?? 0) + item.quantity);
    });
  });

  const topSellingItem =
    [...itemCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "No sales yet";

  return {
    todaysOrders: todaysOrders.length,
    todaysRevenue: completedToday.reduce((sum, order) => sum + order.total, 0),
    newOrders: orders.filter((order) => order.status === "New").length,
    completedOrders: completed.length,
    repeatCustomers: customers.filter((customer) => customer.total_orders > 1).length,
    averageOrderValue:
      completed.length > 0
        ? completed.reduce((sum, order) => sum + order.total, 0) / completed.length
        : 0,
    topSellingItem
  };
}
