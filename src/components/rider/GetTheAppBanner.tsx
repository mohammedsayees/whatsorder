"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { isRiderApp, riderAppDeepLink } from "@/lib/rider-native";

/**
 * Browser only: nudges the rider to the app, which keeps sharing location
 * while they use Google Maps. A browser cannot tell whether the app is
 * installed, so the button just tries to open it.
 */
export function GetTheAppBanner({ token }: { token: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => setShow(!isRiderApp()), []);

  if (!show) {
    return null;
  }

  return (
    <section className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <p className="flex items-center gap-2 text-sm font-black text-blue-900">
        <Smartphone size={16} />
        Use the WhatsOrder Rider app
      </p>
      <p className="mt-1 text-sm text-blue-900">
        The app keeps sharing your location while you use Google Maps. In the browser, sharing pauses when you leave this page.
      </p>
      <a
        className="focus-ring mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-blue-700 px-5 py-2.5 text-sm font-black text-white"
        href={riderAppDeepLink(token)}
      >
        Open in the app
      </a>
    </section>
  );
}
