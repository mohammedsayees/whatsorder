import Link from "next/link";
import { AlertTriangle, ArrowRight, ReceiptText, Search } from "lucide-react";
import { SubscriptionStatusBadge } from "@/components/super-admin/BillingBadges";
import { formatAED } from "@/lib/currency";
import { formatUaeDate } from "@/lib/date-time";
import { priceForSubscription, type SubscriptionStatus } from "@/lib/billing";
import { listActivePlans, listSubscriptionsForBilling } from "@/lib/billing-data";
import { getSuperAdminRestaurants } from "@/lib/super-admin-data";
import { assignPlanAction } from "./actions";

const statusFilters: Array<{ value: "all" | SubscriptionStatus; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "trialing", label: "Trialing" },
  { value: "active", label: "Active" },
  { value: "past_due", label: "Past due" },
  { value: "suspended", label: "Suspended" },
  { value: "cancelled", label: "Cancelled" }
];

export default async function SuperAdminBillingPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; status?: string; outstanding?: string; error?: string }>;
}) {
  const [subscriptions, plans, restaurants, query] = await Promise.all([
    listSubscriptionsForBilling(),
    listActivePlans(),
    getSuperAdminRestaurants(),
    searchParams
  ]);

  const subscribedIds = new Set(subscriptions.map((entry) => entry.subscription.restaurant_id));
  const unsubscribed = restaurants.filter((restaurant) => !subscribedIds.has(restaurant.id));
  const search = (query.q ?? "").trim().toLowerCase();
  const activeStatus = statusFilters.some((filter) => filter.value === query.status)
    ? query.status ?? "all"
    : "all";
  const outstandingOnly = query.outstanding === "1";
  const visibleSubscriptions = subscriptions.filter(({ restaurant, subscription, outstanding }) => {
    const matchesSearch =
      !search ||
      restaurant.name.toLowerCase().includes(search) ||
      restaurant.slug.toLowerCase().includes(search);
    const matchesStatus = activeStatus === "all" || subscription.status === activeStatus;
    return matchesSearch && matchesStatus && (!outstandingOnly || outstanding > 0);
  });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <p className="text-sm font-black uppercase text-leaf">Revenue operations</p>
        <h1 className="mt-1 text-3xl font-black">Billing</h1>
        <p className="mt-2 text-stone-600">
          Track plans, issue invoices, record bank-transfer and cash payments, and manage
          subscription status by hand.
        </p>
      </div>

      {query.error ? (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          <AlertTriangle size={16} /> {decodeURIComponent(query.error)}
        </p>
      ) : null}

      <section className="mt-6 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <form className="grid gap-3 sm:grid-cols-[1fr_190px_auto_auto]" method="get">
          <label className="relative">
            <Search className="absolute left-3 top-3 text-stone-400" size={18} />
            <input
              aria-label="Search billing by restaurant or slug"
              className="focus-ring w-full rounded-lg border border-stone-200 py-2.5 pl-10 pr-3"
              defaultValue={query.q ?? ""}
              name="q"
              placeholder="Search restaurant or slug"
            />
          </label>
          <select
            aria-label="Filter subscriptions by status"
            className="focus-ring rounded-lg border border-stone-200 px-3 py-2.5 text-sm font-bold"
            defaultValue={activeStatus}
            name="status"
          >
            {statusFilters.map((filter) => (
              <option key={filter.value} value={filter.value}>{filter.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm font-bold">
            <input defaultChecked={outstandingOnly} name="outstanding" type="checkbox" value="1" />
            Outstanding only
          </label>
          <button className="rounded-lg bg-ink px-5 py-2.5 text-sm font-black text-white" type="submit">
            Apply
          </button>
        </form>
      </section>

      <section className="mt-5 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <header className="border-b border-stone-200 px-5 py-4">
          <h2 className="text-lg font-black">Subscriptions</h2>
        </header>
        {visibleSubscriptions.length === 0 ? (
          <p className="px-5 py-8 text-center text-stone-500">No subscriptions match this view.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-5 py-3 font-black">Restaurant</th>
                  <th className="px-5 py-3 font-black">Plan</th>
                  <th className="px-5 py-3 font-black">Contract price</th>
                  <th className="px-5 py-3 font-black">Status</th>
                  <th className="px-5 py-3 font-black">Cycle ends</th>
                  <th className="px-5 py-3 font-black">Outstanding</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {visibleSubscriptions.map(({ subscription, plan, restaurant, outstanding }) => {
                  const contractPrice = plan ? priceForSubscription(plan, subscription, today) : 0;
                  const activeOverride =
                    subscription.price_override !== null &&
                    (!subscription.price_override_ends_at || subscription.price_override_ends_at >= today);
                  return (
                    <tr key={subscription.id} className="hover:bg-stone-50">
                    <td className="px-5 py-3 font-bold">{restaurant.name}</td>
                    <td className="px-5 py-3">
                      <span className="block">{plan?.name ?? "—"}</span>
                      <span className="text-xs capitalize text-stone-500">
                        {subscription.billing_interval}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-bold">
                      {activeOverride ? (
                        <span className="text-leaf">
                          {formatAED(contractPrice)}
                          <span className="ml-1 text-xs font-normal text-stone-500">custom</span>
                        </span>
                      ) : (
                        <span>{formatAED(contractPrice)}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <SubscriptionStatusBadge status={subscription.status} />
                    </td>
                    <td className="px-5 py-3 text-stone-600">
                      {formatUaeDate(subscription.billing_cycle_end)}
                    </td>
                    <td className="px-5 py-3 font-bold">
                      {outstanding > 0 ? (
                        <span className="text-amber-700">{formatAED(outstanding)}</span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-black text-leaf hover:bg-mint"
                        href={`/super-admin/billing/${restaurant.id}`}
                      >
                        Manage <ArrowRight size={15} />
                      </Link>
                    </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <ReceiptText className="text-leaf" size={18} />
          <h2 className="text-lg font-black">Start billing for a restaurant</h2>
        </div>
        <p className="mt-1 text-sm text-stone-600">
          Enrol a restaurant on a monthly or yearly contract. A non-trial enrolment issues the
          first invoice for the selected contract period immediately.
        </p>
        {unsubscribed.length === 0 ? (
          <p className="mt-4 text-sm text-stone-500">Every restaurant already has a subscription.</p>
        ) : (
          <form action={assignPlanAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-sm font-bold text-stone-700">
              Restaurant
              <select
                className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
                name="restaurant_id"
                required
              >
                {unsubscribed.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold text-stone-700">
              Plan
              <select
                className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
                name="plan_id"
                required
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} — {formatAED(Number(plan.monthly_price))}/mo · {formatAED(Number(plan.annual_price))}/yr
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold text-stone-700">
              Contract
              <select
                className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
                defaultValue="monthly"
                name="billing_interval"
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            <label className="flex items-center gap-2 self-end text-sm font-bold text-stone-700">
              <input className="h-4 w-4" name="start_trial" type="checkbox" />
              Start as 30-day trial
            </label>
            <button
              className="focus-ring self-end rounded-lg bg-leaf px-4 py-2.5 text-sm font-black text-white"
              type="submit"
            >
              Enrol
            </button>
            <details className="rounded-lg border border-stone-200 bg-stone-50 p-3 lg:col-span-5">
              <summary className="cursor-pointer text-sm font-black text-stone-700">
                Custom contract price / discount
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="text-sm font-bold text-stone-700">
                  Contract price (AED)
                  <input className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2" inputMode="decimal" min="0" name="price_override" placeholder="Leave blank for plan price" step="0.01" type="number" />
                </label>
                <label className="text-sm font-bold text-stone-700">
                  Reason
                  <input className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2" name="price_override_reason" placeholder="e.g. Founding customer" />
                </label>
                <label className="text-sm font-bold text-stone-700">
                  Ends on (optional)
                  <input className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2" name="price_override_ends_at" type="date" />
                </label>
              </div>
            </details>
          </form>
        )}
      </section>
    </main>
  );
}
