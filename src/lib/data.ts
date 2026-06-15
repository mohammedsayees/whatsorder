import { getSupabase, getSupabaseAdmin } from "@/lib/supabase";
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
      return data as Restaurant;
    }
  }

  if (slug === demoRestaurant.slug) {
    return demoRestaurant;
  }

  return null;
}

export async function getDefaultRestaurant() {
  return getRestaurantBySlug(defaultSlug);
}

export async function getMenu(restaurantId: string): Promise<MenuWithCategories> {
  const supabase = getSupabase();

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
  }

  return demoOrders.filter((order) => order.restaurant_id === restaurantId);
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
  }

  return demoCustomers.filter((customer) => customer.restaurant_id === restaurantId);
}

export function getAnalytics(orders: Order[], customers: Customer[]): Analytics {
  const today = new Date().toDateString();
  const todaysOrders = orders.filter((order) => new Date(order.created_at).toDateString() === today);
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
