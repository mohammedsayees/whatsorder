import "server-only";

import { getUaeMonthStartIso } from "@/lib/date-time";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  onboardingEventNames,
  type OnboardingEventName
} from "@/lib/onboarding-events";
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
    teamMemberships: normalizedTeamMemberships.filter(
      (membership) => membership.id !== ownerMembership?.id
    )
  };
}

export async function getSuperAdminDashboardData() {
  const restaurants = await getSuperAdminRestaurants();
  const supabase = getSupabaseAdmin();
  const monthStartIso = getUaeMonthStartIso();

  let ordersThisMonth = 0;
  let totalCustomers = restaurants.reduce((sum, restaurant) => sum + restaurant.customers_count, 0);
  let subscriptions: Array<{ status: string }> = [];
  let outstandingBalance = 0;
  const onboardingFunnel = Object.fromEntries(
    onboardingEventNames.map((eventName) => [eventName, 0])
  ) as Record<OnboardingEventName, number>;

  if (supabase) {
    const [
      orderResult,
      customerResult,
      subscriptionResult,
      invoiceResult,
      onboardingEventResult
    ] = await Promise.all([
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthStartIso),
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("subscriptions").select("status"),
      supabase.from("invoices").select("id,total").eq("status", "issued"),
      supabase.from("onboarding_funnel_events").select("event_name")
    ]);
    const dashboardError =
      orderResult.error ??
      customerResult.error ??
      subscriptionResult.error ??
      invoiceResult.error ??
      onboardingEventResult.error;
    if (dashboardError) {
      throw new Error(`Super Admin dashboard metrics could not be loaded: ${dashboardError.message}`);
    }

    ordersThisMonth = orderResult.count ?? 0;
    totalCustomers = customerResult.count ?? totalCustomers;
    subscriptions = (subscriptionResult.data ?? []) as Array<{ status: string }>;
    for (const row of (onboardingEventResult.data ?? []) as Array<{
      event_name: OnboardingEventName;
    }>) {
      if (row.event_name in onboardingFunnel) {
        onboardingFunnel[row.event_name] += 1;
      }
    }
    const invoiceRows = (invoiceResult.data ?? []) as Array<{ id: string; total: number }>;
    if (invoiceRows.length > 0) {
      const invoiceIds = invoiceRows.map((invoice) => invoice.id);
      const { data: paymentRows, error: paymentsError } = await supabase
        .from("payments")
        .select("invoice_id,amount")
        .in("invoice_id", invoiceIds);
      if (paymentsError) {
        throw new Error(`Super Admin outstanding balance could not be loaded: ${paymentsError.message}`);
      }
      const paidByInvoice = new Map<string, number>();
      for (const payment of (paymentRows ?? []) as Array<{ invoice_id: string; amount: number }>) {
        paidByInvoice.set(
          payment.invoice_id,
          (paidByInvoice.get(payment.invoice_id) ?? 0) + Number(payment.amount)
        );
      }
      outstandingBalance = invoiceRows.reduce(
        (sum, invoice) => sum + Math.max(0, Number(invoice.total) - (paidByInvoice.get(invoice.id) ?? 0)),
        0
      );
    }
  }

  return {
    restaurants,
    onboardingFunnel,
    metrics: {
      totalRestaurants: restaurants.length,
      liveRestaurants: restaurants.filter((restaurant) => restaurant.status === "live").length,
      trialContracts: subscriptions.filter((subscription) => subscription.status === "trialing").length,
      activeContracts: subscriptions.filter((subscription) => subscription.status === "active").length,
      pastDueContracts: subscriptions.filter((subscription) => subscription.status === "past_due").length,
      suspendedContracts: subscriptions.filter((subscription) => subscription.status === "suspended").length,
      outstandingBalance,
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
