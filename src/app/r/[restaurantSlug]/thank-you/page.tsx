import { getRestaurantBySlug } from "@/lib/data";
import { loadOrderConfirmation } from "@/lib/order-confirmation";
import { notFound } from "next/navigation";
import { getConfiguredWebPushPublicKey } from "@/lib/push-auth";
import { SavedOrderConfirmation } from "@/components/customer/SavedOrderConfirmation";

export default async function ThankYouPage({ params, searchParams }: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ order?: string; lang?: string }>;
}) {
  const [{ restaurantSlug }, query] = await Promise.all([params, searchParams]);
  const restaurant = await getRestaurantBySlug(restaurantSlug);
  if (!restaurant) notFound();
  const order = await loadOrderConfirmation(restaurant.id, query.order ?? "");
  if (!order) notFound();
  const webPushPublicKey = getConfiguredWebPushPublicKey();
  return <SavedOrderConfirmation restaurant={restaurant} order={order} language={query.lang} webPushPublicKey={webPushPublicKey} />;
}
