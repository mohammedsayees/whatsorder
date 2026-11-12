"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Bounded auto-reload while a bill is being read: a fixed handful of refreshes
// spread over the 60s extraction budget, then stop. Deliberately not an
// open-ended poll (admin polling burned the Vercel Active CPU budget before).
const REFRESH_AFTER_MS = [5_000, 10_000, 18_000, 28_000, 42_000, 62_000];

export function FinanceBillReadingRefresh({ startedAt }: { startedAt: string }) {
  const router = useRouter();

  useEffect(() => {
    const elapsed = Date.now() - new Date(startedAt).getTime();
    const timers = REFRESH_AFTER_MS
      .filter((at) => at > elapsed)
      .map((at) => window.setTimeout(() => router.refresh(), at - elapsed));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [router, startedAt]);

  return null;
}
