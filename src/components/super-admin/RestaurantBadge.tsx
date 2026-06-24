import type { RestaurantPlan, RestaurantStatus } from "@/lib/types";

const statusClasses: Record<RestaurantStatus, string> = {
  draft: "bg-stone-100 text-stone-700",
  onboarding: "bg-amber-50 text-amber-800",
  live: "bg-emerald-50 text-emerald-700",
  trial: "bg-sky-50 text-sky-700",
  paid: "bg-indigo-50 text-indigo-700",
  paused: "bg-orange-50 text-orange-700",
  cancelled: "bg-rose-50 text-rose-700"
};

export function RestaurantStatusBadge({ status }: { status: RestaurantStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black capitalize ${statusClasses[status]}`}>
      {status}
    </span>
  );
}

const planLabels: Record<RestaurantPlan, string> = {
  trial: "Trial",
  starter: "Starter",
  pro: "Pro",
  multi_branch: "Multi-branch"
};

export function RestaurantPlanBadge({ plan }: { plan: RestaurantPlan }) {
  const label = planLabels[plan] ?? plan;
  return (
    <span className="inline-flex rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-black text-stone-700">
      {label}
    </span>
  );
}
