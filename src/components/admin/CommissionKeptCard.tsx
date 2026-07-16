import { PiggyBank } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import type { CommissionKept } from "@/lib/commission";
import type { Restaurant } from "@/lib/types";

function orderLabel(count: number) {
  return count === 1 ? "delivery order" : "delivery orders";
}

/**
 * Compact retention strip at the bottom of the dashboard: what an aggregator
 * would have charged on the same delivery orders. Deliberately one line — it
 * is a marketing message, not operational data, so it must not outrank the
 * stats, trend, or daily coach above it.
 */
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
      <article className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm">
        <PiggyBank className="shrink-0 text-emerald-700" size={18} />
        <p className="text-xs font-semibold text-emerald-800">
          Take delivery orders through WhatsOrder and you&rsquo;ll keep the
          commission an aggregator would have charged ({basis}). Your savings
          will show up here.
        </p>
      </article>
    );
  }

  return (
    <article className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-bold text-emerald-900">
        <PiggyBank className="shrink-0 text-emerald-700" size={18} />
        Commission kept: {formatCurrency(commission.allTime.kept, restaurant)} all time
        <span className="font-semibold text-emerald-700">
          · {formatCurrency(commission.month.kept, restaurant)} this month (
          {commission.month.orders} {orderLabel(commission.month.orders)})
        </span>
      </p>
      <p className="text-xs font-medium text-emerald-700">
        What an aggregator would have charged, {basis}
      </p>
    </article>
  );
}
