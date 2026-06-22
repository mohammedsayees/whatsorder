import { getSupabase, getSupabaseAdmin } from "@/lib/supabase";
import { isSameUaeCalendarDay } from "@/lib/date-time";
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
  MenuCategory,
  MenuItem,
  MenuOffer,
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
    opening_hours: restaurant.opening_hours
  };
}

export async function getRestaurantBySlug(
  slug: string
): Promise<PublicRestaurant | null> {
  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase
      .rpc("get_public_restaurant", { target_slug: slug })
      .maybeSingle();

    if (!error && data) {
      return data as PublicRestaurant;
    }

    if (error && error.code !== "PGRST116" && !demoDataEnabled) {
      productionDataFailure("Restaurant", error);
    }
  } else if (!demoDataEnabled) {
    productionDataFailure("Restaurant");
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

export async function getMenu(
  restaurantId: string,
  options: GetMenuOptions = {}
): Promise<MenuWithCategories> {
  const supabase = options.admin ? getSupabaseAdmin() : getSupabase();

  if (supabase) {
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

    if (categories && items) {
      return {
        categories: categories as MenuCategory[],
        items: items as MenuItem[]
      };
    }

    if (!demoDataEnabled) {
      productionDataFailure("Menu");
    }
  } else if (!demoDataEnabled) {
    productionDataFailure("Menu");
  }

  return {
    categories: demoCategories.filter((category) => category.restaurant_id === restaurantId),
    items: demoItems.filter((item) => item.restaurant_id === restaurantId)
  };
}

export async function getMenuOffers(
  restaurantId: string,
  options: GetMenuOptions = {}
): Promise<MenuOffer[]> {
  const supabase = options.admin ? getSupabaseAdmin() : getSupabase();

  if (!supabase) {
    if (!demoDataEnabled) {
      productionDataFailure("Menu offers");
    }
    return [];
  }

  let query = supabase
    .from("menu_offers")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("display_order")
    .order("created_at");

  if (!options.admin) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (!error && data) {
    return data.map((offer) => ({
      ...offer,
      promotional_price: Number(offer.promotional_price),
      max_quantity_per_order: Number(offer.max_quantity_per_order ?? 1)
    })) as MenuOffer[];
  }

  if (!demoDataEnabled) {
    productionDataFailure("Menu offers", error);
  }

  return [];
}

export async function getRecentOrders(
  restaurantId: string,
  limit = 5
): Promise<Order[]> {
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(Math.min(20, Math.max(1, limit)));

    if (!error && data) {
      return data as Order[];
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

export async function getOrdersForReport(
  restaurantId: string,
  startIso: string,
  endExclusiveIso: string
): Promise<Order[]> {
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", startIso)
      .lt("created_at", endExclusiveIso)
      .order("created_at", { ascending: true });

    if (!error && data) {
      return data as Order[];
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

    const results = await Promise.all(
      chunks.map((phoneChunk) =>
        supabase
          .from("customers")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .in("phone", phoneChunk)
      )
    );
    const failedResult = results.find((result) => result.error);

    if (!failedResult) {
      return results.flatMap((result) => (result.data ?? []) as Customer[]);
    }

    if (!demoDataEnabled) {
      productionDataFailure("Report customers", failedResult.error);
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
      .select("*", { count: "exact" })
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
        items: data as Order[],
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
        .select("id", { count: "exact", head: true })
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
      .select("*")
      .eq("restaurant_id", restaurantId)
      .in("customer_phone", uniquePhones)
      .order("created_at", { ascending: false });

    if (!error && data) {
      return data as Order[];
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
