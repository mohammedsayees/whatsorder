import { notFound } from "next/navigation";
import { CartProvider } from "@/components/customer/CartProvider";
import { CheckoutForm } from "@/components/customer/CheckoutForm";
import { getRestaurantBySlug } from "@/lib/data";

export default async function CheckoutPage({
  params
}: {
  params: Promise<{ restaurantSlug: string }>;
}) {
  const { restaurantSlug } = await params;
  const restaurant = await getRestaurantBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  return (
    <CartProvider restaurantSlug={restaurant.slug}>
      <CheckoutForm restaurant={restaurant} />
    </CartProvider>
  );
}
