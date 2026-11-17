import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RiderLocationSharer } from "@/components/rider/RiderLocationSharer";
import { getRiderTrackingContext } from "@/lib/rider-location-data";

// Private page opened from the rider's WhatsApp assignment message.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Share delivery location",
  robots: { index: false, follow: false }
};

export default async function RiderTrackingPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let context: Awaited<ReturnType<typeof getRiderTrackingContext>> = null;

  try {
    context = await getRiderTrackingContext(token);
  } catch {
    context = null;
  }

  if (!context) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">{context.restaurantName}</p>
      <h1 className="mt-2 text-2xl font-black">Delivery #{context.orderRef}</h1>
      {context.deliveryArea ? (
        <p className="mt-1 text-sm font-semibold text-stone-600">To: {context.deliveryArea}</p>
      ) : null}
      <RiderLocationSharer initialState={context.state} token={token} />
    </main>
  );
}
