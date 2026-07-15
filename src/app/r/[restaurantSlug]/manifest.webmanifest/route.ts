import { NextResponse } from "next/server";
import { getRestaurantBySlug } from "@/lib/data";

// Per-café PWA manifest. The global /manifest.json has start_url "/", so an
// install from a menu page would launch the marketing landing page instead of
// the café. Each /r/[slug] page links this manifest instead (see the route
// layout), scoping the installed app to its own café.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ restaurantSlug: string }> }
) {
  const { restaurantSlug } = await params;
  const restaurant = await getRestaurantBySlug(restaurantSlug);

  if (!restaurant) {
    return new NextResponse("Not found", { status: 404 });
  }

  const base = `/r/${encodeURIComponent(restaurant.slug)}`;

  return NextResponse.json(
    {
      id: base,
      name: restaurant.name,
      short_name: restaurant.name.slice(0, 12),
      description: `Order from ${restaurant.name} on WhatsApp.`,
      start_url: base,
      scope: base,
      display: "standalone",
      background_color: "#fbfaf7",
      theme_color: "#1f8a5b",
      icons: [
        {
          src: "/icons/icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any"
        },
        {
          src: "/icons/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any"
        }
      ]
    },
    {
      headers: {
        "Content-Type": "application/manifest+json",
        // Same TTL as the cached public-restaurant read backing it.
        "Cache-Control": "public, max-age=300"
      }
    }
  );
}
