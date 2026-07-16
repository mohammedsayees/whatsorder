import type { Metadata } from "next";
import { DemoStoreBanner } from "@/components/customer/DemoStoreBanner";
import { getRestaurantBySlug } from "@/lib/data";

// Overrides the root layout's global manifest so "Add to Home Screen" from a
// café page installs a café-scoped PWA (name + start_url + scope = /r/[slug])
// instead of one that launches the marketing landing page.
export async function generateMetadata({
  params
}: {
  params: Promise<{ restaurantSlug: string }>;
}): Promise<Metadata> {
  const { restaurantSlug } = await params;
  const restaurant = await getRestaurantBySlug(restaurantSlug);
  const name = restaurant?.name ?? "WhatsOrder";

  return {
    title: name,
    manifest: `/r/${encodeURIComponent(restaurantSlug)}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      title: name,
      statusBarStyle: "default"
    }
  };
}

export default async function RestaurantLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ restaurantSlug: string }>;
}>) {
  const { restaurantSlug } = await params;
  // Cached read (same tag as the page's fetch) — no extra DB hit in practice.
  const restaurant = await getRestaurantBySlug(restaurantSlug);

  if (!restaurant?.is_demo) {
    return children;
  }

  return (
    <>
      <DemoStoreBanner restaurant={restaurant} />
      {children}
    </>
  );
}
