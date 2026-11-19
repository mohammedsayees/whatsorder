import { getRestaurantBySlug } from "@/lib/data";
import { loadOrderConfirmation } from "@/lib/order-confirmation";
import { notFound } from "next/navigation";
import { getConfiguredWebPushPublicKey } from "@/lib/push-auth";
import { SavedOrderConfirmation } from "@/components/customer/SavedOrderConfirmation";
import { getRestaurantAdminSession } from "@/lib/super-admin-auth";
import { getRestaurantPrepEstimate } from "@/lib/prep-time-data";
import { refreshOrderPayment } from "@/lib/stripe/order-payments";

export default async function ThankYouPage({ params, searchParams }: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ order?: string; lang?: string; onboarding?: string; payment?: string }>;
}) {
  const [{ restaurantSlug }, query] = await Promise.all([params, searchParams]);
  const restaurant = await getRestaurantBySlug(restaurantSlug);
  if (!restaurant) notFound();
  const [order, prepEstimate] = await Promise.all([
    loadOrderConfirmation(restaurant.id, query.order ?? ""),
    getRestaurantPrepEstimate(restaurant.id)
  ]);
  if (!order) notFound();
  if (order.online_payment_status === "pending") {
    // Back from Stripe before the webhook: ask Stripe directly.
    order.online_payment_status = await refreshOrderPayment(restaurant, order.id);
  }
  const onboardingSession = query.onboarding === "test-order"
    ? await getRestaurantAdminSession()
    : null;
  const onboardingTest =
    onboardingSession?.restaurantId === restaurant.id &&
    onboardingSession.role !== "staff";
  const webPushPublicKey = getConfiguredWebPushPublicKey();
  return <SavedOrderConfirmation restaurant={restaurant} order={order} language={query.lang} onboardingTest={onboardingTest} webPushPublicKey={webPushPublicKey} prepMinutes={prepEstimate?.minutes ?? null} paymentReturn={query.payment ?? null} />;
}
