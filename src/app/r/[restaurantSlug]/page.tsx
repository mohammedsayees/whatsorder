import { notFound } from "next/navigation";
import { CartProvider } from "@/components/customer/CartProvider";
import { RestaurantMenu } from "@/components/customer/RestaurantMenu";
import { getMenu, getRestaurantBySlug } from "@/lib/data";

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

  const menu = await getMenu(restaurant.id);

  return (
    <CartProvider restaurantSlug={restaurant.slug}>
      <RestaurantMenu restaurant={restaurant} categories={menu.categories} items={menu.items} />
    </CartProvider>
  );
}
