import { notFound } from "next/navigation";
import { CartProvider } from "@/components/customer/CartProvider";
import { RestaurantMenu } from "@/components/customer/RestaurantMenu";
import { getMenu, getMenuOffers, getRestaurantBySlug } from "@/lib/data";
import { getPublicFeedback } from "@/lib/feedback";
import { loadCustomerContext } from "@/lib/customer-auth/context";

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

  const [menu, offers, feedback, customer] = await Promise.all([
    getMenu(restaurant.id),
    getMenuOffers(restaurant.id),
    getPublicFeedback(restaurant),
    // Signed-in returning customer → loyalty card + reorder strip. Cold open
    // returns immediately without a DB hit.
    loadCustomerContext(restaurant.id)
  ]);

  return (
    <CartProvider restaurantSlug={restaurant.slug}>
      <RestaurantMenu
        restaurant={restaurant}
        categories={menu.categories}
        feedback={feedback}
        items={menu.items}
        loyalty={customer.loyalty}
        offers={offers}
        recentOrders={customer.recentOrders}
        tableNumber={tableNumber}
      />
    </CartProvider>
  );
}
