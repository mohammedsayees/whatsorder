import type { PublicRestaurant } from "@/lib/types";

// Instant demo stores: banner + "make this real" CTA shown across the
// customer PWA when the tenant is a self-serve demo. Server component with
// zero client JS — the customer bundle stays untouched.

const FOUNDER_WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_DEMO_WHATSAPP_NUMBER ?? "971551150068";

function daysLeft(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) {
    return null;
  }
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(remainingMs)) {
    return null;
  }
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}

export function DemoStoreBanner({ restaurant }: { restaurant: PublicRestaurant }) {
  if (!restaurant.is_demo) {
    return null;
  }

  const remaining = daysLeft(restaurant.demo_expires_at);
  const waUrl = `https://wa.me/${FOUNDER_WHATSAPP_NUMBER}?text=${encodeURIComponent(
    `Hi! I built a demo store (${restaurant.slug}) and I'd like to make it real.`
  )}`;

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-emerald-950 px-4 py-2.5 text-center text-sm text-emerald-50">
      <span>
        Demo store — test orders come to WhatsOrder, not a restaurant.
        {remaining !== null && (
          <span className="text-emerald-300"> Expires in {remaining} day{remaining === 1 ? "" : "s"}.</span>
        )}
      </span>
      <a
        href={waUrl}
        target="_blank"
        rel="noopener"
        className="rounded-full bg-emerald-500 px-3 py-1 font-semibold text-emerald-950 hover:bg-emerald-400"
      >
        Make this real →
      </a>
    </div>
  );
}
