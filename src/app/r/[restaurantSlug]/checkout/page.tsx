import { notFound, redirect } from "next/navigation";
import { currentSlugForReleasedSlug } from "@/lib/slug-history";
import { CartProvider } from "@/components/customer/CartProvider";
import { CheckoutForm } from "@/components/customer/CheckoutForm";
import { getRestaurantBySlug } from "@/lib/data";
import { loadCustomerContext } from "@/lib/customer-auth/context";

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
    // A renamed store keeps its old link: send old QR codes to the new one.
    const currentSlug = await currentSlugForReleasedSlug(restaurantSlug);
    if (currentSlug) {
      redirect(`/r/${currentSlug}/checkout`);
    }
    notFound();
  }

  // Signed-in returning customer → prefill name/address from their profile.
  // Cold open returns immediately without a DB hit.
  const { profile } = await loadCustomerContext(restaurant.id);

  return (
    <CartProvider restaurantSlug={restaurant.slug}>
      <CheckoutForm initialTableNumber={tableNumber} prefill={profile} restaurant={restaurant} />
    </CartProvider>
  );
}
