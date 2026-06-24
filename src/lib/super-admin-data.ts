import "server-only";

import { getUaeMonthStartIso } from "@/lib/date-time";
import { getSupabaseAdmin } from "@/lib/supabase";
import type {
  Customer,
  MenuCategory,
  MenuItem,
  MenuOffer,
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
  offers: MenuOffer[];
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

type RestaurantSummaryRow = {
  restaurant_id: string;
  orders_count: number | string;
  customers_count: number | string;
  onboarding_completed: number | string;
  onboarding_total: number | string;
  last_order_at: string | null;
};

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

  const [
    { data: restaurants, error: restaurantsError },
    { data: summaries, error: summariesError }
  ] = await Promise.all([
    supabase.from("restaurants").select("*").order("created_at", { ascending: false }),
    supabase.rpc("get_super_admin_restaurant_summaries")
  ]);
  if (restaurantsError || summariesError) {
    throw new Error("Super Admin restaurant summaries could not be loaded.");
  }
  const summaryByRestaurant = new Map(
    ((summaries ?? []) as RestaurantSummaryRow[]).map((summary) => [
      String(summary.restaurant_id),
      summary
    ])
  );

  return ((restaurants ?? []) as Restaurant[]).map((restaurant) => {
    const summary = summaryByRestaurant.get(restaurant.id);

    return {
      ...restaurant,
      status: restaurant.status ?? (restaurant.is_active ? "live" : "draft"),
      plan: restaurant.plan ?? "trial",
      orders_count: Number(summary?.orders_count ?? 0),
      customers_count: Number(summary?.customers_count ?? 0),
      onboarding_completed: Number(summary?.onboarding_completed ?? 0),
      onboarding_total: Number(summary?.onboarding_total ?? 0),
      last_order_at: summary?.last_order_at ? String(summary.last_order_at) : null
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
    { data: offers },
    { data: orders },
    { data: customers },
    { data: teamMemberships },
    { count: ordersCount },
    { count: customersCount }
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
    supabase
      .from("menu_offers")
      .select("*")
      .eq("restaurant_id", id)
      .order("display_order")
      .order("created_at"),
    supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("customers")
      .select("*")
      .eq("restaurant_id", id)
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("restaurant_users")
      .select("id,user_id,email,role,invited_at,accepted_at")
      .eq("restaurant_id", id)
      .order("created_at"),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", id),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", id)
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
      orders_count: ordersCount ?? 0,
      customers_count: customersCount ?? 0,
      onboarding_completed: restaurantTasks.filter((task) => task.is_completed).length,
      onboarding_total: restaurantTasks.length,
      last_order_at: restaurantOrders[0]?.created_at ?? null
    },
    onboardingTasks: restaurantTasks,
    categories: (categories ?? []) as MenuCategory[],
    items: (items ?? []) as MenuItem[],
    offers: (offers ?? []).map((offer) => ({
      ...offer,
      promotional_price: Number(offer.promotional_price),
      max_quantity_per_order: Number(offer.max_quantity_per_order ?? 1)
    })) as MenuOffer[],
    orders: restaurantOrders,
    customers: (customers ?? []) as Customer[],
    ownerMembership,
    teamMemberships: normalizedTeamMemberships
  };
}

export async function getSuperAdminDashboardData() {
  const restaurants = await getSuperAdminRestaurants();
  const supabase = getSupabaseAdmin();
  const monthStartIso = getUaeMonthStartIso();

  let ordersThisMonth = 0;
  let totalCustomers = restaurants.reduce((sum, restaurant) => sum + restaurant.customers_count, 0);

  if (supabase) {
    const [{ count: orderCount }, { count: customerCount }] = await Promise.all([
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthStartIso),
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
          ["starter", "pro", "multi_branch"].includes(restaurant.plan ?? "")
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
