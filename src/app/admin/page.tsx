import { getWhatsAppIntegration } from "@/lib/whatsapp-integration";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnalyticsCards } from "@/components/admin/AnalyticsCards";
import { CommissionKeptCard } from "@/components/admin/CommissionKeptCard";
import { DailySummaryCard } from "@/components/admin/DailySummaryCard";
import { DashboardAttentionStrip } from "@/components/admin/DashboardAttentionStrip";
import { OnboardingProgressCard } from "@/components/admin/OnboardingProgressCard";
import {
  DashboardTrendCard,
  type DashboardTrendMetric
} from "@/components/admin/DashboardTrendCard";
import {
  getAdminDashboardSnapshot
} from "@/lib/data";
import type { DashboardTrendRange } from "@/lib/types";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";
import { getOnboardingProgress } from "@/lib/onboarding-progress";
import { recordOnboardingEvent } from "@/lib/onboarding-events";

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
    verified?: string;
    settings?: string;
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

  const [{ analytics, trend, dailySummary, commission }, onboarding, integration] = await Promise.all([
    getAdminDashboardSnapshot(restaurant, range),
    getOnboardingProgress(restaurant.id),
    getWhatsAppIntegration(restaurant.id),
    recordOnboardingEvent(restaurant.id, "dashboard_opened", "admin_dashboard")
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
      {integration?.provider === "whatsapp_web" && integration.status !== "active" ? (
        <section role="alert" className="my-5 rounded-lg border border-rose-300 bg-rose-50 p-4 text-rose-900">
          <h2 className="font-black">WhatsApp needs attention</h2>
          <p className="mt-1 text-sm">The restaurant&apos;s WhatsApp Web transport is not connected.
            Automatic replies and updates through it are unavailable until connection is restored.</p>
          <Link className="mt-2 inline-block font-bold underline" href="/admin/integrations/whatsapp">Check connection and reconnect</Link>
        </section>
      ) : null}
      {query.welcome ? (
        <section className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-900">
          <h2 className="text-lg font-black">You&apos;re live. Welcome to WhatsOrder.</h2>
          <p className="mt-1 text-sm">
            Your menu is ready at{" "}
            <Link className="font-bold underline" href={`/r/${restaurant.slug}`}>
              /r/{restaurant.slug}
            </Link>
            . Start with one test order; delivery, detailed hours and the rest can wait.
          </p>
          <Link
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-leaf px-4 py-2 text-sm font-bold text-white"
            href={`/r/${restaurant.slug}?onboarding=test-order`}
            rel="noopener"
            target="_blank"
          >
            Place my test order
            <ArrowRight size={16} />
          </Link>
          {query.settings === "0" ? (
            <p className="mt-3 text-sm text-amber-900">
              Your initial order settings didn&apos;t save. Review them in{" "}
              <Link className="font-bold underline" href="/admin/settings">
                Settings
              </Link>
              .
            </p>
          ) : null}
        </section>
      ) : null}
      {query.verified ? (
        <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          Email confirmed. Thanks!
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
        <OnboardingProgressCard
          acceptingOrders={restaurant.accepting_orders !== false}
          progress={onboarding}
          restaurantSlug={restaurant.slug}
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
