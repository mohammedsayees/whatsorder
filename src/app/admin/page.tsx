import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnalyticsCards } from "@/components/admin/AnalyticsCards";
import { CommissionKeptCard } from "@/components/admin/CommissionKeptCard";
import { DailySummaryCard } from "@/components/admin/DailySummaryCard";
import { DashboardAttentionStrip } from "@/components/admin/DashboardAttentionStrip";
import {
  DashboardTrendCard,
  type DashboardTrendMetric
} from "@/components/admin/DashboardTrendCard";
import {
  getCommissionKept,
  getDashboardAnalytics,
  getDashboardTrend,
  getLatestDailySummary
} from "@/lib/data";
import type { DashboardTrendRange } from "@/lib/types";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

function parseRange(value: string | undefined): DashboardTrendRange {
  return value === "30d" || value === "mtd" ? value : "7d";
}

function parseMetric(value: string | undefined): DashboardTrendMetric {
  return value === "orders" ? "orders" : "sales";
}

export default async function AdminDashboardPage({
  searchParams
}: {
  searchParams: Promise<{
    welcome?: string;
    error?: string;
    range?: string;
    metric?: string;
  }>;
}) {
  const [query, { restaurant }] = await Promise.all([
    searchParams,
    requireRestaurantAdmin()
  ]);
  const range = parseRange(query.range);
  const metric = parseMetric(query.metric);

  const [analytics, trend, dailySummary, commission] = await Promise.all([
    getDashboardAnalytics(restaurant.id),
    getDashboardTrend(restaurant.id, range),
    getLatestDailySummary(restaurant.id),
    getCommissionKept(restaurant)
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-leaf">{restaurant.name}</p>
          <h1 className="text-3xl font-black">Dashboard</h1>
        </div>
        <Link
          className="focus-ring inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-bold text-white"
          href={`/r/${restaurant.slug}`}
        >
          Public menu
          <ArrowRight size={16} />
        </Link>
      </div>
      {query.welcome ? (
        <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          Your restaurant account is active. Welcome to WhatsOrder.
        </p>
      ) : null}
      {query.error ? (
        <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {query.error}
        </p>
      ) : null}

      <div className="mt-6">
        <DashboardAttentionStrip
          inProgressOrders={trend.inProgressOrders}
          newOrders={analytics.newOrders}
        />
      </div>

      <div className="mt-6">
        <AnalyticsCards
          analytics={analytics}
          monthSales={trend.monthSales}
          restaurant={restaurant}
        />
      </div>

      <div className="mt-6">
        <DashboardTrendCard
          metric={metric}
          range={range}
          restaurant={restaurant}
          trend={trend}
        />
      </div>

      {dailySummary ? (
        <div className="mt-6">
          <DailySummaryCard restaurant={restaurant} summary={dailySummary} />
        </div>
      ) : null}

      <div className="mt-6">
        <CommissionKeptCard commission={commission} restaurant={restaurant} />
      </div>
    </main>
  );
}
