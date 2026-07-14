import Link from "next/link";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { getRestaurantBySlug } from "@/lib/data";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { notFound } from "next/navigation";

export default async function ThankYouPage({
  params,
  searchParams
}: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  const [{ restaurantSlug }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const restaurant = await getRestaurantBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-mint text-leaf">
        <CheckCircle2 size={34} />
      </div>
      <h1 className="mt-6 text-3xl font-black">Order saved</h1>
      <p className="mt-3 leading-7 text-stone-600">
        Your structured order has been prepared for WhatsApp. If WhatsApp did not open, return to
        checkout and tap the send button again.
      </p>
      {resolvedSearchParams.order ? (
        <p className="mt-4 rounded-lg bg-stone-100 px-4 py-3 text-sm font-bold text-stone-700">
          Reference: {resolvedSearchParams.order}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-leaf px-5 py-3 font-bold text-white"
          href={buildWhatsAppUrl(
            restaurant.whatsapp_number,
            "Hi, I need help with my WhatsOrder order.",
            restaurant.phone_country_code
          )}
        >
          <MessageCircle size={18} />
          Open WhatsApp
        </Link>
        <Link
          className="focus-ring inline-flex justify-center rounded-full border border-stone-200 bg-white px-5 py-3 font-bold text-ink"
          href={`/r/${restaurant.slug}`}
        >
          Back to menu
        </Link>
      </div>
    </main>
  );
}
