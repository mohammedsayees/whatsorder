import { Banknote, CheckCircle2, Clock, Repeat2, ShoppingBag, Star, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import type { Analytics, Restaurant } from "@/lib/types";

export function AnalyticsCards({ analytics, restaurant }: { analytics: Analytics; restaurant: Restaurant }) {
  const cards = [
    { label: "Today's orders", value: analytics.todaysOrders, icon: ShoppingBag },
    { label: "Today's revenue", value: formatCurrency(analytics.todaysRevenue, restaurant), icon: Banknote },
    { label: "New orders", value: analytics.newOrders, icon: Clock },
    { label: "Completed orders", value: analytics.completedOrders, icon: CheckCircle2 },
    { label: "Repeat customers", value: analytics.repeatCustomers, icon: Repeat2 },
    { label: "Average order value", value: formatCurrency(analytics.averageOrderValue, restaurant), icon: TrendingUp },
    { label: "Top-selling item", value: analytics.topSellingItem, icon: Star }
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <article className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm" key={card.label}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-stone-500">{card.label}</p>
                <p className="mt-2 text-2xl font-black">{card.value}</p>
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-mint text-leaf">
                <Icon size={19} />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
