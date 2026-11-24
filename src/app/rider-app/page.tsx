import type { Metadata } from "next";
import { NativeLinkListener } from "@/components/rider/NativeLinkListener";
import { OpenDeliveryLinkForm } from "@/components/rider/OpenDeliveryLinkForm";

// Start screen of the WhatsOrder Rider app (a Capacitor shell that loads this
// page). Public and contains no data: a delivery opens only from its own link.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "WhatsOrder Rider",
  robots: { index: false, follow: false }
};

export default function RiderAppStartPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-10">
      <NativeLinkListener />
      <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">WhatsOrder</p>
      <h1 className="mt-2 text-2xl font-black">Rider</h1>
      <p className="mt-3 text-stone-700">
        When the restaurant assigns you a delivery, tap the link in the WhatsApp message. It opens here. You can also paste
        the link below.
      </p>
      <OpenDeliveryLinkForm />
      <p className="mt-6 text-xs leading-5 text-stone-500">
        Allow location &ldquo;Always&rdquo; when asked, so the customer can follow your delivery while you use your maps app.
      </p>
    </main>
  );
}
