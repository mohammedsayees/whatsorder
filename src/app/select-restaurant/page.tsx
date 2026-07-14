import { redirect } from "next/navigation";
import { Store } from "lucide-react";
import { getSelectableRestaurants } from "@/lib/super-admin-auth";
import { selectActiveRestaurantAction } from "@/app/select-restaurant/actions";

export default async function SelectRestaurantPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [restaurants, query] = await Promise.all([
    getSelectableRestaurants(),
    searchParams
  ]);

  if (restaurants.length === 0) {
    redirect(
      "/admin-login?error=This%20account%20is%20not%20assigned%20to%20an%20active%20restaurant."
    );
  }

  // A single membership needs no choice; let the normal session flow load it.
  if (restaurants.length === 1) {
    redirect("/admin");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-stone-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-mint text-leaf">
          <Store size={24} />
        </div>
        <h1 className="mt-5 text-2xl font-black">Choose a restaurant</h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Your account manages more than one restaurant. Pick the one you want to
          work on. You can switch later by signing in again.
        </p>
        {query.error ? (
          <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
            {query.error}
          </p>
        ) : null}
        <ul className="mt-6 space-y-3">
          {restaurants.map((restaurant) => (
            <li key={restaurant.restaurantId}>
              <form action={selectActiveRestaurantAction}>
                <input name="restaurant_id" type="hidden" value={restaurant.restaurantId} />
                <button
                  className="focus-ring flex w-full items-center justify-between gap-3 rounded-lg border border-stone-200 px-4 py-3 text-left font-bold hover:border-leaf hover:bg-mint"
                  type="submit"
                >
                  <span>
                    <span className="block">{restaurant.name}</span>
                    <span className="block text-xs font-semibold capitalize text-stone-500">
                      {restaurant.role.replace("_", " ")}
                    </span>
                  </span>
                  <span aria-hidden className="text-stone-400">
                    →
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
