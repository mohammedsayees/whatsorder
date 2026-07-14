import Link from "next/link";
import { Building2, Eye, Plus, Search } from "lucide-react";
import { RestaurantPlanBadge, RestaurantStatusBadge } from "@/components/super-admin/RestaurantBadge";
import { formatUaeDate } from "@/lib/date-time";
import { getSuperAdminRestaurants } from "@/lib/super-admin-data";
import type { RestaurantStatus } from "@/lib/types";

const filters = ["all", "draft", "onboarding", "live", "trial", "paid", "paused"] as const;

export default async function SuperAdminRestaurantsPage({
  searchParams
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const [restaurants, query] = await Promise.all([getSuperAdminRestaurants(), searchParams]);
  const activeFilter = filters.includes(query.filter as (typeof filters)[number]) ? query.filter! : "all";
  const search = (query.q ?? "").trim().toLowerCase();
  const visibleRestaurants = restaurants.filter((restaurant) => {
    const matchesFilter =
      activeFilter === "all" ||
      restaurant.status === activeFilter ||
      (activeFilter === "trial" && restaurant.plan === "trial") ||
      (activeFilter === "paid" && ["starter", "pro", "multi_branch"].includes(restaurant.plan ?? ""));
    const matchesSearch =
      !search ||
      restaurant.name.toLowerCase().includes(search) ||
      restaurant.slug.toLowerCase().includes(search);
    return matchesFilter && matchesSearch;
  });

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase text-leaf">Portfolio</p>
          <h1 className="mt-1 text-3xl font-black">Restaurants</h1>
          <p className="mt-2 text-stone-600">Search, review, and manage every WhatsOrder restaurant.</p>
        </div>
        <Link
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-leaf px-4 py-3 text-sm font-black text-white"
          href="/super-admin/restaurants/new"
        >
          <Plus size={18} />
          Add restaurant
        </Link>
      </div>

      <section className="mt-6 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <form className="flex flex-col gap-3 sm:flex-row" method="get">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-3 text-stone-400" size={18} />
            <input
              className="focus-ring w-full rounded-lg border border-stone-200 py-2.5 pl-10 pr-3"
              defaultValue={query.q ?? ""}
              name="q"
              placeholder="Search restaurant name or slug"
            />
          </label>
          <input name="filter" type="hidden" value={activeFilter} />
          <button className="rounded-lg bg-ink px-5 py-2.5 text-sm font-black text-white" type="submit">
            Search
          </button>
        </form>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {filters.map((filter) => (
            <Link
              className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-black capitalize ${
                activeFilter === filter ? "bg-leaf text-white" : "bg-stone-100 text-stone-600"
              }`}
              href={`/super-admin/restaurants?filter=${filter}${query.q ? `&q=${encodeURIComponent(query.q)}` : ""}`}
              key={filter}
            >
              {filter}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[1.5fr_1fr_1fr_1fr_1fr_80px] gap-4 border-b border-stone-200 bg-stone-50 px-5 py-3 text-xs font-black uppercase text-stone-500 lg:grid">
          <span>Restaurant</span>
          <span>Status / plan</span>
          <span>Contact</span>
          <span>Orders</span>
          <span>Created</span>
          <span>Action</span>
        </div>
        <div className="divide-y divide-stone-100">
          {visibleRestaurants.map((restaurant) => (
            <article
              className="grid gap-4 px-5 py-4 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_80px] lg:items-center"
              key={restaurant.id}
            >
              <div>
                <p className="font-black">{restaurant.name}</p>
                <p className="mt-1 text-sm text-stone-500">/r/{restaurant.slug} · {restaurant.city || "No city"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <RestaurantStatusBadge status={(restaurant.status ?? "draft") as RestaurantStatus} />
                <RestaurantPlanBadge plan={restaurant.plan ?? "trial"} />
              </div>
              <div className="text-sm">
                <p className="font-bold">{restaurant.whatsapp_number}</p>
                <p className="text-stone-500">{restaurant.owner_email || "No owner email"}</p>
              </div>
              <div>
                <p className="font-black">{restaurant.orders_count}</p>
                <p className="text-xs text-stone-500">{restaurant.customers_count} customers</p>
              </div>
              <p className="text-sm text-stone-600">
                {formatUaeDate(restaurant.created_at)}
              </p>
              <Link
                aria-label={`View ${restaurant.name}`}
                className="focus-ring grid h-9 w-9 place-items-center rounded-lg border border-stone-200 text-stone-600 hover:bg-mint hover:text-leaf"
                href={`/super-admin/restaurants/${restaurant.id}`}
              >
                <Eye size={17} />
              </Link>
            </article>
          ))}
          {visibleRestaurants.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <Building2 className="mx-auto text-stone-300" size={36} />
              <p className="mt-3 font-black">No restaurants match this view</p>
              <p className="mt-1 text-sm text-stone-500">Try another status or search term.</p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
