import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import type {
  Customer,
  MenuCategory,
  MenuItem,
  OnboardingTask,
  Order,
  Restaurant,
  SuperAdminRestaurant
} from "@/lib/types";

type RestaurantDetail = {
  restaurant: SuperAdminRestaurant;
  onboardingTasks: OnboardingTask[];
  categories: MenuCategory[];
  items: MenuItem[];
  orders: Order[];
  customers: Customer[];
  ownerMembership: {
    id: string;
    user_id: string | null;
    email: string;
    role: string;
    invited_at: string | null;
    accepted_at: string | null;
  } | null;
  teamMemberships: Array<{
    id: string;
    user_id: string | null;
    email: string;
    role: string;
    invited_at: string | null;
    accepted_at: string | null;
  }>;
};

function countByRestaurant(rows: Array<{ restaurant_id: string }>) {
  return rows.reduce<Map<string, number>>((counts, row) => {
    counts.set(row.restaurant_id, (counts.get(row.restaurant_id) ?? 0) + 1);
    return counts;
  }, new Map());
}

export function getPublicAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  if (configured) {
    return configured;
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}

export async function getSuperAdminRestaurants(): Promise<SuperAdminRestaurant[]> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return [];
  }

  const [{ data: restaurants }, { data: orders }, { data: customers }, { data: tasks }] =
    await Promise.all([
      supabase.from("restaurants").select("*").order("created_at", { ascending: false }),
      supabase.from("orders").select("restaurant_id,created_at"),
      supabase.from("customers").select("restaurant_id"),
      supabase.from("onboarding_tasks").select("restaurant_id,is_completed")
    ]);

  const orderRows = (orders ?? []) as Array<{ restaurant_id: string; created_at: string }>;
  const orderCounts = countByRestaurant(orderRows);
  const customerCounts = countByRestaurant((customers ?? []) as Array<{ restaurant_id: string }>);
  const taskRows = (tasks ?? []) as Array<{ restaurant_id: string; is_completed: boolean }>;

  return ((restaurants ?? []) as Restaurant[]).map((restaurant) => {
    const restaurantTasks = taskRows.filter((task) => task.restaurant_id === restaurant.id);
    const restaurantOrders = orderRows.filter((order) => order.restaurant_id === restaurant.id);

    return {
      ...restaurant,
      status: restaurant.status ?? (restaurant.is_active ? "live" : "draft"),
      plan: restaurant.plan ?? "trial",
      orders_count: orderCounts.get(restaurant.id) ?? 0,
      customers_count: customerCounts.get(restaurant.id) ?? 0,
      onboarding_completed: restaurantTasks.filter((task) => task.is_completed).length,
      onboarding_total: restaurantTasks.length,
      last_order_at:
        restaurantOrders.sort(
          (first, second) =>
            new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
        )[0]?.created_at ?? null
    };
  });
}

export async function getSuperAdminRestaurant(id: string): Promise<RestaurantDetail | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return null;
  }

  const [
    { data: restaurant },
    { data: onboardingTasks },
    { data: categories },
    { data: items },
    { data: orders },
    { data: customers },
    { data: teamMemberships }
  ] = await Promise.all([
    supabase.from("restaurants").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("onboarding_tasks")
      .select("*")
      .eq("restaurant_id", id)
      .order("created_at"),
    supabase
      .from("menu_categories")
      .select("*")
      .eq("restaurant_id", id)
      .order("display_order"),
    supabase.from("menu_items").select("*").eq("restaurant_id", id).order("created_at"),
    supabase.from("orders").select("*").eq("restaurant_id", id).order("created_at", {
      ascending: false
    }),
    supabase.from("customers").select("*").eq("restaurant_id", id).order("updated_at", {
      ascending: false
    }),
    supabase
      .from("restaurant_users")
      .select("id,user_id,email,role,invited_at,accepted_at")
      .eq("restaurant_id", id)
      .order("created_at")
  ]);

  if (!restaurant) {
    return null;
  }

  const restaurantOrders = (orders ?? []) as Order[];
  const restaurantTasks = (onboardingTasks ?? []) as OnboardingTask[];
  const normalizedTeamMemberships = (teamMemberships ?? []).map((membership) => ({
    id: String(membership.id),
    user_id: membership.user_id ? String(membership.user_id) : null,
    email: String(membership.email),
    role: String(membership.role),
    invited_at: membership.invited_at ? String(membership.invited_at) : null,
    accepted_at: membership.accepted_at ? String(membership.accepted_at) : null
  }));
  const ownerMembership =
    normalizedTeamMemberships.find((membership) =>
      ["restaurant_admin", "owner"].includes(membership.role)
    ) ?? null;

  return {
    restaurant: {
      ...(restaurant as Restaurant),
      status: (restaurant.status as Restaurant["status"]) ?? "draft",
      plan: (restaurant.plan as Restaurant["plan"]) ?? "trial",
      orders_count: restaurantOrders.length,
      customers_count: (customers ?? []).length,
      onboarding_completed: restaurantTasks.filter((task) => task.is_completed).length,
      onboarding_total: restaurantTasks.length,
      last_order_at: restaurantOrders[0]?.created_at ?? null
    },
    onboardingTasks: restaurantTasks,
    categories: (categories ?? []) as MenuCategory[],
    items: (items ?? []) as MenuItem[],
    orders: restaurantOrders,
    customers: (customers ?? []) as Customer[],
    ownerMembership,
    teamMemberships: normalizedTeamMemberships
  };
}

export async function getSuperAdminDashboardData() {
  const restaurants = await getSuperAdminRestaurants();
  const supabase = getSupabaseAdmin();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  let ordersThisMonth = 0;
  let totalCustomers = restaurants.reduce((sum, restaurant) => sum + restaurant.customers_count, 0);

  if (supabase) {
    const [{ count: orderCount }, { count: customerCount }] = await Promise.all([
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthStart.toISOString()),
      supabase.from("customers").select("id", { count: "exact", head: true })
    ]);

    ordersThisMonth = orderCount ?? 0;
    totalCustomers = customerCount ?? totalCustomers;
  }

  return {
    restaurants,
    metrics: {
      totalRestaurants: restaurants.length,
      liveRestaurants: restaurants.filter((restaurant) => restaurant.status === "live").length,
      trialRestaurants: restaurants.filter(
        (restaurant) => restaurant.status === "trial" || restaurant.plan === "trial"
      ).length,
      paidRestaurants: restaurants.filter(
        (restaurant) =>
          restaurant.status === "paid" ||
          ["starter", "growth", "pro", "custom"].includes(restaurant.plan ?? "")
      ).length,
      ordersThisMonth,
      totalCustomers,
      onboardingRestaurants: restaurants.filter(
        (restaurant) =>
          restaurant.status === "onboarding" ||
          restaurant.onboarding_completed < restaurant.onboarding_total
      ).length
    }
  };
}
