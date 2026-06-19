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
  MenuWithCategories,
  Order,
  Restaurant
} from "@/lib/types";

const defaultSlug = process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG ?? "chaixpress";
const demoDataEnabled =
  process.env.NODE_ENV !== "production" || process.env.ENABLE_DEMO_DATA === "true";

function productionDataFailure(resource: string, error?: { message?: string } | null): never {
  console.error("WhatsOrder production data read failed", {
    resource,
    message: error?.message ?? "Supabase is not configured"
  });

  throw new Error(
    `${resource} could not be loaded from Supabase.${error?.message ? ` ${error.message}` : ""}`
  );
}

export async function getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (!error && data) {
      const restaurant = data as Restaurant;
      const unavailableStatuses = ["draft", "onboarding", "paused", "cancelled"];

      if (restaurant.status && unavailableStatuses.includes(restaurant.status)) {
        return null;
      }

      return restaurant;
    }

    if (error && error.code !== "PGRST116" && !demoDataEnabled) {
      productionDataFailure("Restaurant", error);
    }
  } else if (!demoDataEnabled) {
    productionDataFailure("Restaurant");
  }

  if (demoDataEnabled && slug === demoRestaurant.slug) {
    return demoRestaurant;
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

export async function getOrders(restaurantId: string): Promise<Order[]> {
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      return data as Order[];
    }

    if (!demoDataEnabled) {
      productionDataFailure("Orders", error);
    }
  } else if (!demoDataEnabled) {
    productionDataFailure("Orders");
  }

  return demoOrders.filter((order) => order.restaurant_id === restaurantId);
}

export async function getNewOrderCount(restaurantId: string): Promise<number> {
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { count, error } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("status", "New");

    if (!error) {
      return count ?? 0;
    }

    if (!demoDataEnabled) {
      productionDataFailure("New-order count", error);
    }
  } else if (!demoDataEnabled) {
    productionDataFailure("New-order count");
  }

  return demoOrders.filter(
    (order) => order.restaurant_id === restaurantId && order.status === "New"
  ).length;
}

export async function getCustomers(restaurantId: string): Promise<Customer[]> {
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("updated_at", { ascending: false });

    if (!error && data) {
      return data as Customer[];
    }

    if (!demoDataEnabled) {
      productionDataFailure("Customers", error);
    }
  } else if (!demoDataEnabled) {
    productionDataFailure("Customers");
  }

  return demoCustomers.filter((customer) => customer.restaurant_id === restaurantId);
}

export function getAnalytics(orders: Order[], customers: Customer[]): Analytics {
  const now = new Date();
  const todaysOrders = orders.filter((order) =>
    isSameUaeCalendarDay(order.created_at, now)
  );
  const completed = orders.filter((order) => order.status === "Completed");
  const itemCounts = new Map<string, number>();

  orders.forEach((order) => {
    order.items.forEach((item) => {
      itemCounts.set(item.name, (itemCounts.get(item.name) ?? 0) + item.quantity);
    });
  });

  const topSellingItem =
    [...itemCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "No sales yet";

  return {
    todaysOrders: todaysOrders.length,
    todaysRevenue: todaysOrders.reduce((sum, order) => sum + order.total, 0),
    newOrders: orders.filter((order) => order.status === "New").length,
    completedOrders: completed.length,
    repeatCustomers: customers.filter((customer) => customer.total_orders > 1).length,
    averageOrderValue:
      orders.length > 0 ? orders.reduce((sum, order) => sum + order.total, 0) / orders.length : 0,
    topSellingItem
  };
}
