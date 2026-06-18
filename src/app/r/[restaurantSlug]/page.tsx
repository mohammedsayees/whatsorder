import { notFound } from "next/navigation";
import { CartProvider } from "@/components/customer/CartProvider";
import { RestaurantMenu } from "@/components/customer/RestaurantMenu";
import { getMenu, getRestaurantBySlug } from "@/lib/data";
import { getPublicFeedback } from "@/lib/feedback";

export default async function RestaurantPage({
  params
}: {
  params: Promise<{ restaurantSlug: string }>;
}) {
  const { restaurantSlug } = await params;
  const restaurant = await getRestaurantBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  const [menu, feedback] = await Promise.all([
    getMenu(restaurant.id),
    getPublicFeedback(restaurant)
  ]);

  return (
    <CartProvider restaurantSlug={restaurant.slug}>
      <RestaurantMenu
        restaurant={restaurant}
        categories={menu.categories}
        feedback={feedback}
        items={menu.items}
      />
    </CartProvider>
  );
}
