import Link from "next/link";
import {
  ArrowRight,
  AlertTriangle,
  Ban,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  ReceiptText,
  Store,
  Users
} from "lucide-react";
import { formatAED } from "@/lib/currency";
import { getSuperAdminDashboardData } from "@/lib/super-admin-data";
import { RestaurantStatusBadge } from "@/components/super-admin/RestaurantBadge";

export default async function SuperAdminDashboardPage() {
  const { metrics, onboardingFunnel, restaurants } = await getSuperAdminDashboardData();
  const cards = [
    { label: "Total restaurants", value: metrics.totalRestaurants, icon: Building2, href: "/super-admin/restaurants" },
    { label: "Live restaurants", value: metrics.liveRestaurants, icon: Store, href: "/super-admin/restaurants?filter=live" },
    { label: "Active contracts", value: metrics.activeContracts, icon: CreditCard, href: "/super-admin/billing?status=active" },
    { label: "Trial contracts", value: metrics.trialContracts, icon: ClipboardCheck, href: "/super-admin/billing?status=trialing" },
    { label: "Past-due contracts", value: metrics.pastDueContracts, icon: AlertTriangle, href: "/super-admin/billing?status=past_due", urgent: metrics.pastDueContracts > 0 },
    { label: "Suspended contracts", value: metrics.suspendedContracts, icon: Ban, href: "/super-admin/billing?status=suspended", urgent: metrics.suspendedContracts > 0 },
    { label: "Outstanding balance", value: formatAED(metrics.outstandingBalance), icon: CreditCard, href: "/super-admin/billing?outstanding=1", urgent: metrics.outstandingBalance > 0 },
    { label: "Orders this month", value: metrics.ordersThisMonth, icon: ReceiptText, href: "/super-admin/restaurants" },
    { label: "Total customers", value: metrics.totalCustomers, icon: Users, href: "/super-admin/restaurants" },
    { label: "Still onboarding", value: metrics.onboardingRestaurants, icon: CheckCircle2, href: "/super-admin/onboarding" }
  ];
  const funnel = [
    ["Demo built", onboardingFunnel.demo_built],
    ["Menu reviewed", onboardingFunnel.menu_reviewed],
    ["Claim opened", onboardingFunnel.claim_viewed],
    ["Restaurant claimed", onboardingFunnel.restaurant_claimed],
    ["Dashboard opened", onboardingFunnel.dashboard_opened],
    ["Test started", onboardingFunnel.test_order_started],
    ["Test accepted", onboardingFunnel.test_order_accepted],
    ["QR opened", onboardingFunnel.qr_opened]
  ] as const;
  const funnelStart = onboardingFunnel.demo_built;

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <p className="text-sm font-black uppercase text-leaf">Operations overview</p>
        <h1 className="mt-1 text-3xl font-black">Super Admin dashboard</h1>
        <p className="mt-2 text-stone-600">Monitor restaurant rollout, usage, and onboarding from one place.</p>
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;

          return (
            <Link
              className={`focus-ring rounded-lg border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                card.urgent ? "border-amber-300" : "border-stone-200"
              }`}
              href={card.href}
              key={card.label}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-stone-500">{card.label}</p>
                <Icon className={card.urgent ? "text-amber-700" : "text-leaf"} size={19} />
              </div>
              <p className="mt-3 text-3xl font-black">{card.value}</p>
            </Link>
          );
        })}
      </section>

      <section className="mt-8 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-leaf">Activation funnel</p>
          <h2 className="mt-1 text-lg font-black">First-time owner conversion</h2>
          <p className="mt-1 text-sm text-stone-500">
            One first-occurrence event per restaurant. No customer contact data is stored here.
          </p>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {funnel.map(([label, count], index) => (
            <article className="rounded-lg bg-stone-50 p-3" key={label}>
              <p className="text-xs font-bold text-stone-500">{index + 1}. {label}</p>
              <p className="mt-2 text-2xl font-black">{count}</p>
              <p className="mt-1 text-xs font-semibold text-stone-400">
                {funnelStart > 0 ? `${Math.round((count / funnelStart) * 100)}% of demos` : "No demos yet"}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-black">Restaurant rollout</h2>
            <p className="text-sm text-stone-500">Newest restaurants and onboarding progress.</p>
          </div>
          <Link className="inline-flex items-center gap-2 text-sm font-black text-leaf" href="/super-admin/restaurants">
            View all
            <ArrowRight size={16} />
          </Link>
        </div>
        <div className="divide-y divide-stone-100">
          {restaurants.slice(0, 6).map((restaurant) => {
            const percent =
              restaurant.onboarding_total > 0
                ? Math.round((restaurant.onboarding_completed / restaurant.onboarding_total) * 100)
                : 0;

            return (
              <Link
                className="grid gap-3 px-5 py-4 transition hover:bg-stone-50 sm:grid-cols-[1fr_auto_180px] sm:items-center"
                href={`/super-admin/restaurants/${restaurant.id}`}
                key={restaurant.id}
              >
                <div>
                  <p className="font-black">{restaurant.name}</p>
                  <p className="text-sm text-stone-500">/r/{restaurant.slug} · {restaurant.city || "City not set"}</p>
                </div>
                <RestaurantStatusBadge status={restaurant.status ?? "draft"} />
                <div>
                  <div className="flex justify-between text-xs font-bold text-stone-500">
                    <span>Onboarding</span>
                    <span>{percent}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
                    <div className="h-full rounded-full bg-leaf" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              </Link>
            );
          })}
          {restaurants.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Building2 className="mx-auto text-stone-300" size={34} />
              <p className="mt-3 font-black">No restaurants yet</p>
              <Link className="mt-2 inline-block text-sm font-bold text-leaf" href="/super-admin/restaurants/new">
                Create the first restaurant
              </Link>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
