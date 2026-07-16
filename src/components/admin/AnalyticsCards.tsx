import { Banknote, CalendarRange, ShoppingBag, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import type { Analytics, Restaurant } from "@/lib/types";

export function AnalyticsCards({
  analytics,
  monthSales,
  restaurant
}: {
  analytics: Analytics;
  monthSales: number;
  restaurant: Restaurant;
}) {
  const cards = [
    { label: "Today's orders", value: analytics.todaysOrders, icon: ShoppingBag },
    { label: "Today's sales", value: formatCurrency(analytics.todaysRevenue, restaurant), icon: Banknote },
    { label: "This month", value: formatCurrency(monthSales, restaurant), icon: CalendarRange },
    { label: "Average order value", value: formatCurrency(analytics.averageOrderValue, restaurant), icon: TrendingUp }
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
