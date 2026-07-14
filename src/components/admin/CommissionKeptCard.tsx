import { PiggyBank } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import type { CommissionKept } from "@/lib/commission";
import type { Restaurant } from "@/lib/types";

function orderLabel(count: number) {
  return count === 1 ? "delivery order" : "delivery orders";
}

export function CommissionKeptCard({
  commission,
  restaurant
}: {
  commission: CommissionKept;
  restaurant: Restaurant;
}) {
  const basis = commission.isDefaultRate
    ? `based on ${commission.rate}% commission`
    : `at your ${commission.rate}% commission rate`;

  // Honest empty state: never imply savings before any delivery order exists.
  if (commission.allTime.orders === 0) {
    return (
      <article className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
            <PiggyBank size={20} />
          </div>
          <div>
            <h2 className="text-lg font-black text-emerald-900">Commission kept</h2>
            <p className="mt-1 text-sm font-semibold text-emerald-800">
              Take delivery orders through WhatsOrder and you&rsquo;ll keep the
              commission an aggregator would have charged. Your savings will show
              up here ({basis}).
            </p>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
          <PiggyBank size={20} />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-black text-emerald-900">Commission kept</h2>
          <p className="mt-1 text-3xl font-black text-emerald-900">
            {formatCurrency(commission.allTime.kept, restaurant)}
            <span className="ml-2 align-middle text-sm font-bold text-emerald-700">
              kept since you joined
            </span>
          </p>
          <p className="mt-2 text-sm font-semibold text-emerald-800">
            {commission.month.orders} {orderLabel(commission.month.orders)} ·{" "}
            {formatCurrency(commission.month.kept, restaurant)} in commission kept this month
          </p>
          <p className="mt-1 text-xs font-medium text-emerald-700">
            Delivery orders only, {basis}. This is what an aggregator like Talabat
            would have charged on the same orders.
          </p>
        </div>
      </div>
    </article>
  );
}
