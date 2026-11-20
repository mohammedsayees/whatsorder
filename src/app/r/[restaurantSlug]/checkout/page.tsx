import { notFound, redirect } from "next/navigation";
import { currentSlugForReleasedSlug } from "@/lib/slug-history";
import { CartProvider } from "@/components/customer/CartProvider";
import { CheckoutForm } from "@/components/customer/CheckoutForm";
import { sanitizeAttributionSource } from "@/lib/attribution";
import { getRestaurantBySlug } from "@/lib/data";
import { loadCustomerContext } from "@/lib/customer-auth/context";
import { loadCustomerAddresses } from "@/lib/customer-addresses-data";
import { getRestaurantAdminSession } from "@/lib/super-admin-auth";
import { getCheckoutSuggestions } from "@/lib/checkout-suggestion-data";
import { getOnlinePaymentAccount } from "@/lib/stripe/order-payments";

export default async function CheckoutPage({
  params,
  searchParams
}: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ table?: string; onboarding?: string; src?: string }>;
}) {
  const [{ restaurantSlug }, query] = await Promise.all([params, searchParams]);
  const tableNumber = String(query.table ?? "").trim().slice(0, 40);
  const onboardingRequested = query.onboarding === "test-order";
  const attributionSource = sanitizeAttributionSource(query.src);
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
  const [customer, onboardingSession, suggestions, onlinePaymentAccount] = await Promise.all([
    loadCustomerContext(restaurant.id),
    onboardingRequested ? getRestaurantAdminSession() : Promise.resolve(null),
    getCheckoutSuggestions(restaurant.id),
    // "Pay online" only when the restaurant's Stripe account is active.
    getOnlinePaymentAccount(restaurant).catch(() => null)
  ]);
  const { profile } = customer;
  // Saved addresses only for a verified session at this café (the context
  // loader has already checked the cookie and staff sign-outs).
  const signedIn = customer.signedIn && !customer.error && Boolean(customer.phone);
  const savedAddresses =
    signedIn && customer.phone
      ? await loadCustomerAddresses({ restaurantId: restaurant.id, phone: customer.phone })
      : [];
  const onboardingTest =
    onboardingSession?.restaurantId === restaurant.id &&
    onboardingSession.role !== "staff";

  return (
    <CartProvider restaurantSlug={restaurant.slug}>
      <CheckoutForm
        attributionSource={attributionSource}
        initialTableNumber={tableNumber}
        onboardingTest={onboardingTest}
        onlinePaymentAvailable={Boolean(onlinePaymentAccount)}
        prefill={profile}
        restaurant={restaurant}
        savedAddresses={savedAddresses}
        signedIn={signedIn}
        suggestions={suggestions}
      />
    </CartProvider>
  );
}
