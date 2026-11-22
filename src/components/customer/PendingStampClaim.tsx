"use client";

import { useEffect, useState } from "react";
import { claimStampAction } from "@/app/r/[restaurantSlug]/stamp/actions";
import { pendingStampClaimKey } from "@/lib/customer-auth/stamp-claim";
import { stampClaimText, type StampClaimResult } from "@/lib/stamp-claim-text";

type Translate = (en: string, ar: string) => string;

// Its own module so the account page does not bundle the stamp page's UI.
/**
 * Finishes a receipt claim saved before the customer signed in. Mounted on
 * the account page (where the WhatsApp sign-in link lands); renders nothing
 * when there is no pending claim.
 */
export function PendingStampClaim({ restaurantSlug, t }: { restaurantSlug: string; t: Translate }) {
  const [result, setResult] = useState<StampClaimResult | null>(null);

  useEffect(() => {
    let token: string | null = null;
    try {
      const key = pendingStampClaimKey(restaurantSlug);
      const raw = window.localStorage.getItem(key);
      window.localStorage.removeItem(key);
      const saved = raw ? (JSON.parse(raw) as { token?: unknown; savedAt?: unknown }) : null;
      // The claim token itself expires in 24h; drop stale device copies sooner.
      if (
        saved &&
        typeof saved.token === "string" &&
        typeof saved.savedAt === "number" &&
        Date.now() - saved.savedAt < 24 * 60 * 60 * 1000
      ) {
        token = saved.token;
      }
    } catch {
      token = null;
    }
    if (!token) return;
    let active = true;
    void claimStampAction(restaurantSlug, token)
      .then((outcome) => {
        if (active) setResult(outcome);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [restaurantSlug]);

  if (!result) {
    return null;
  }
  return (
    <p
      className={`mt-4 rounded-2xl px-4 py-3 text-sm font-black ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
      role="status"
    >
      {stampClaimText(result, t)}
    </p>
  );
}
