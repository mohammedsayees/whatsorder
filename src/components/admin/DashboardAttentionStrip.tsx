import Link from "next/link";
import { ArrowRight, BellRing, CircleCheck } from "lucide-react";

function countLabel(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Routes the owner to the order queue instead of hosting it: the dashboard
 * shows how the business is doing, /admin/orders is where work happens.
 */
export function DashboardAttentionStrip({
  newOrders,
  inProgressOrders
}: {
  newOrders: number;
  inProgressOrders: number;
}) {
  if (newOrders === 0 && inProgressOrders === 0) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold text-stone-500">
          <CircleCheck className="text-leaf" size={18} />
          All caught up — no orders waiting
        </p>
        <Link className="focus-ring flex items-center gap-1 rounded text-sm font-bold text-leaf" href="/admin/orders">
          View orders
          <ArrowRight size={14} />
        </Link>
      </div>
    );
  }

  const parts = [
    newOrders > 0 ? countLabel(newOrders, "new order") : null,
    inProgressOrders > 0 ? countLabel(inProgressOrders, "order") + " in progress" : null
  ].filter(Boolean);
  const verb = newOrders + inProgressOrders === 1 ? "needs" : "need";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
        <BellRing size={18} />
        {parts.join(" and ")} {verb} attention
      </p>
      <Link
        className="focus-ring flex shrink-0 items-center gap-1 rounded text-sm font-black text-amber-900"
        href="/admin/orders"
      >
        View orders
        <ArrowRight size={14} />
      </Link>
    </div>
  );
}
