import Link from "next/link";
import { CheckCircle2, Circle, ClipboardCheck } from "lucide-react";
import { getSuperAdminRestaurants } from "@/lib/super-admin-data";
import { RestaurantStatusBadge } from "@/components/super-admin/RestaurantBadge";

export default async function SuperAdminOnboardingPage() {
  const restaurants = await getSuperAdminRestaurants();
  const onboarding = restaurants
    .filter(
      (restaurant) =>
        restaurant.status === "onboarding" ||
        restaurant.onboarding_completed < restaurant.onboarding_total
    )
    .sort((first, second) => {
      const firstPercent =
        first.onboarding_total > 0 ? first.onboarding_completed / first.onboarding_total : 0;
      const secondPercent =
        second.onboarding_total > 0 ? second.onboarding_completed / second.onboarding_total : 0;
      return firstPercent - secondPercent;
    });

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <p className="text-sm font-black uppercase text-leaf">Rollout queue</p>
        <h1 className="mt-1 text-3xl font-black">Restaurant onboarding</h1>
        <p className="mt-2 text-stone-600">Prioritize incomplete restaurant setups and pilot launch tasks.</p>
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        {onboarding.map((restaurant) => {
          const percent =
            restaurant.onboarding_total > 0
              ? Math.round((restaurant.onboarding_completed / restaurant.onboarding_total) * 100)
              : 0;

          return (
            <Link
              className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm transition hover:border-leaf/30 hover:shadow-md"
              href={`/super-admin/restaurants/${restaurant.id}?tab=onboarding`}
              key={restaurant.id}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-black">{restaurant.name}</p>
                  <p className="mt-1 text-sm text-stone-500">/r/{restaurant.slug} · {restaurant.city || "City not set"}</p>
                </div>
                <RestaurantStatusBadge status={restaurant.status ?? "draft"} />
              </div>
              <div className="mt-5 flex items-center justify-between text-sm font-bold">
                <span>{restaurant.onboarding_completed} of {restaurant.onboarding_total} tasks</span>
                <span>{percent}%</span>
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-leaf" style={{ width: `${percent}%` }} />
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm font-bold text-stone-500">
                {percent === 100 ? <CheckCircle2 className="text-leaf" size={17} /> : <Circle size={17} />}
                {percent === 100 ? "Ready for final review" : `${100 - percent}% remaining`}
              </div>
            </Link>
          );
        })}
      </section>

      {onboarding.length === 0 ? (
        <div className="mt-6 rounded-lg border border-stone-200 bg-white px-5 py-16 text-center shadow-sm">
          <ClipboardCheck className="mx-auto text-stone-300" size={42} />
          <p className="mt-4 text-lg font-black">No restaurants are waiting on onboarding</p>
          <p className="mt-1 text-sm text-stone-500">New and incomplete restaurant setups will appear here.</p>
        </div>
      ) : null}
    </main>
  );
}
