import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnalyticsCards } from "@/components/admin/AnalyticsCards";
import { OrderList } from "@/components/admin/OrderList";
import { getAnalytics, getCustomers, getDefaultRestaurant, getOrders } from "@/lib/data";

export default async function AdminDashboardPage() {
  const restaurant = await getDefaultRestaurant();

  if (!restaurant) {
    return null;
  }

  const [orders, customers] = await Promise.all([getOrders(restaurant.id), getCustomers(restaurant.id)]);
  const analytics = getAnalytics(orders, customers);

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

      <div className="mt-6">
        <AnalyticsCards analytics={analytics} />
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-black">Recent orders</h2>
          <Link className="text-sm font-bold text-leaf" href="/admin/orders">
            View all
          </Link>
        </div>
        <OrderList orders={orders.slice(0, 5)} />
      </section>
    </main>
  );
}
