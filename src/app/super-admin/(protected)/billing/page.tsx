import Link from "next/link";
import { ArrowRight, ReceiptText } from "lucide-react";
import { SubscriptionStatusBadge } from "@/components/super-admin/BillingBadges";
import { formatAED } from "@/lib/currency";
import { formatUaeDate } from "@/lib/date-time";
import { listActivePlans, listSubscriptionsForBilling } from "@/lib/billing-data";
import { getSuperAdminRestaurants } from "@/lib/super-admin-data";
import { assignPlanAction } from "./actions";

export default async function SuperAdminBillingPage() {
  const [subscriptions, plans, restaurants] = await Promise.all([
    listSubscriptionsForBilling(),
    listActivePlans(),
    getSuperAdminRestaurants()
  ]);

  const subscribedIds = new Set(subscriptions.map((entry) => entry.subscription.restaurant_id));
  const unsubscribed = restaurants.filter((restaurant) => !subscribedIds.has(restaurant.id));

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

      <section className="mt-6 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <header className="border-b border-stone-200 px-5 py-4">
          <h2 className="text-lg font-black">Subscriptions</h2>
        </header>
        {subscriptions.length === 0 ? (
          <p className="px-5 py-8 text-center text-stone-500">No subscriptions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-5 py-3 font-black">Restaurant</th>
                  <th className="px-5 py-3 font-black">Plan</th>
                  <th className="px-5 py-3 font-black">Status</th>
                  <th className="px-5 py-3 font-black">Cycle ends</th>
                  <th className="px-5 py-3 font-black">Outstanding</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {subscriptions.map(({ subscription, plan, restaurant, outstanding }) => (
                  <tr key={subscription.id} className="hover:bg-stone-50">
                    <td className="px-5 py-3 font-bold">{restaurant.name}</td>
                    <td className="px-5 py-3">{plan?.name ?? "—"}</td>
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
                ))}
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
          Enrol a restaurant on a plan. A non-trial enrolment issues the first invoice for the
          current calendar month immediately.
        </p>
        {unsubscribed.length === 0 ? (
          <p className="mt-4 text-sm text-stone-500">Every restaurant already has a subscription.</p>
        ) : (
          <form action={assignPlanAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                    {plan.name} — {formatAED(Number(plan.monthly_price))}/mo
                  </option>
                ))}
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
          </form>
        )}
      </section>
    </main>
  );
}
