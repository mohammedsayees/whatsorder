import { notFound } from "next/navigation";
import { CartProvider } from "@/components/customer/CartProvider";
import { RestaurantMenu } from "@/components/customer/RestaurantMenu";
import { getMenu, getMenuOffers, getRestaurantBySlug } from "@/lib/data";
import { getPublicFeedback } from "@/lib/feedback";

export default async function RestaurantPage({
  params,
  searchParams
}: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ table?: string }>;
}) {
  const [{ restaurantSlug }, query] = await Promise.all([params, searchParams]);
  const tableNumber = String(query.table ?? "").trim().slice(0, 40);
  const restaurant = await getRestaurantBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  const [menu, offers, feedback] = await Promise.all([
    getMenu(restaurant.id),
    getMenuOffers(restaurant.id),
    getPublicFeedback(restaurant)
  ]);

  return (
    <CartProvider restaurantSlug={restaurant.slug}>
      <RestaurantMenu
        restaurant={restaurant}
        categories={menu.categories}
        feedback={feedback}
        items={menu.items}
        offers={offers}
        tableNumber={tableNumber}
      />
    </CartProvider>
  );
}
