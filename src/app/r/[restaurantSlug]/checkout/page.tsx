import { notFound } from "next/navigation";
import { CartProvider } from "@/components/customer/CartProvider";
import { CheckoutForm } from "@/components/customer/CheckoutForm";
import { getRestaurantBySlug } from "@/lib/data";

export default async function CheckoutPage({
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

  return (
    <CartProvider restaurantSlug={restaurant.slug}>
      <CheckoutForm initialTableNumber={tableNumber} restaurant={restaurant} />
    </CartProvider>
  );
}
