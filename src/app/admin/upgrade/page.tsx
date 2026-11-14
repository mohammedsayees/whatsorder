import Link from "next/link";
import { Sparkles } from "lucide-react";

import { isPlanFeatureFlag } from "@/lib/billing";
import { getTenantAccess } from "@/lib/billing-data";
import { GATED_FEATURE_LABELS } from "@/lib/plan-gates";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

export const dynamic = "force-dynamic";

const GROWTH_INCLUDES = [
  "Marketing posters, AI artwork and customer campaigns",
  "WhatsApp chat inbox with AI auto-replies",
  "Finance, recipe costing and bill scanning",
  "Advanced analytics and scheduled orders",
  "10 staff accounts and 100 AI images a month"
];

export default async function UpgradePage({
  searchParams
}: {
  searchParams: Promise<{ feature?: string }>;
}) {
  const [session, query] = await Promise.all([requireRestaurantAdmin(), searchParams]);
  const access = await getTenantAccess(session.restaurantId);
  const feature = query.feature && isPlanFeatureFlag(query.feature) ? query.feature : null;
  const label = feature ? GATED_FEATURE_LABELS[feature] : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <div className="rounded-lg border border-stone-200 bg-white p-8 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-mint">
          <Sparkles className="text-leaf" size={22} />
        </div>
        <h1 className="mt-4 text-2xl font-black">
          {label ? `${label} is part of Growth` : "Upgrade to Growth"}
        </h1>
        <p className="mt-2 text-stone-600">
          You&apos;re on the {access.plan_name ?? "Starter"} plan. Growth is AED 299 a month, or
          AED 2,990 a year (2 months free).
        </p>
        <ul className="mt-5 space-y-2 text-sm text-stone-700">
          {GROWTH_INCLUDES.map((item) => (
            <li key={item}>✓ {item}</li>
          ))}
        </ul>
        <p className="mt-6 rounded-lg bg-mint px-4 py-3 text-sm font-bold text-leaf">
          Contact WhatsOrder support to upgrade. Your customer ordering page is unaffected.
        </p>
        <Link className="mt-6 inline-block text-sm font-bold text-leaf underline" href="/admin">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
