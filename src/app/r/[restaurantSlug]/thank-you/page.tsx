import { getRestaurantBySlug } from "@/lib/data";
import { loadOrderConfirmation } from "@/lib/order-confirmation";
import { notFound } from "next/navigation";
import { getConfiguredWebPushPublicKey } from "@/lib/push-auth";
import { SavedOrderConfirmation } from "@/components/customer/SavedOrderConfirmation";
import { getRestaurantAdminSession } from "@/lib/super-admin-auth";

export default async function ThankYouPage({ params, searchParams }: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ order?: string; lang?: string; onboarding?: string }>;
}) {
  const [{ restaurantSlug }, query] = await Promise.all([params, searchParams]);
  const restaurant = await getRestaurantBySlug(restaurantSlug);
  if (!restaurant) notFound();
  const order = await loadOrderConfirmation(restaurant.id, query.order ?? "");
  if (!order) notFound();
  const onboardingSession = query.onboarding === "test-order"
    ? await getRestaurantAdminSession()
    : null;
  const onboardingTest =
    onboardingSession?.restaurantId === restaurant.id &&
    onboardingSession.role !== "staff";
  const webPushPublicKey = getConfiguredWebPushPublicKey();
  return <SavedOrderConfirmation restaurant={restaurant} order={order} language={query.lang} onboardingTest={onboardingTest} webPushPublicKey={webPushPublicKey} />;
}
