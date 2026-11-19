"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// While Stripe confirms a "Pay online" payment, re-render the order page
// every few seconds (the server re-checks Stripe), for up to two minutes.
const INTERVAL_MS = 3000;
const MAX_TRIES = 40;

export function PaymentConfirmingRefresh() {
  const router = useRouter();

  useEffect(() => {
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (tries > MAX_TRIES || document.visibilityState === "hidden") {
        if (tries > MAX_TRIES) window.clearInterval(timer);
        return;
      }
      router.refresh();
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  return null;
}
