import type { FunnelEvent } from "@/lib/customer-funnel";
import type { FulfilmentType } from "@/lib/types";

// Browser side of the ordering funnel. Tiny on purpose: it ships in the menu
// bundle. A random per-visit id lives in sessionStorage (shared by the menu,
// checkout and thank-you pages in the same tab); nothing personal is sent.

const SESSION_KEY = "whatsorder-funnel-session";
const sentThisPage = new Set<string>();

function visitId(): string | null {
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);

    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID().replace(/-/g, "")
          : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.padEnd(16, "0");
      window.sessionStorage.setItem(SESSION_KEY, id);
    }

    return id;
  } catch {
    return null;
  }
}

export function trackFunnel(
  restaurantId: string,
  event: FunnelEvent,
  extra: { orderId?: string; detail?: string; fulfilmentType?: FulfilmentType } = {}
) {
  if (typeof window === "undefined") {
    return;
  }

  // The server keeps one row per step per visit anyway; skip repeat sends.
  const dedupeKey = `${restaurantId}:${event}:${extra.orderId ?? ""}`;

  if (sentThisPage.has(dedupeKey)) {
    return;
  }

  const sessionId = visitId();

  if (!sessionId) {
    return;
  }

  sentThisPage.add(dedupeKey);
  const body = JSON.stringify({ restaurantId, sessionId, event, ...extra });

  try {
    if (
      navigator.sendBeacon?.("/api/customer/events", new Blob([body], { type: "application/json" }))
    ) {
      return;
    }
  } catch {
    // Fall through to fetch.
  }

  void fetch("/api/customer/events", {
    body,
    headers: { "content-type": "application/json" },
    keepalive: true,
    method: "POST"
  }).catch(() => undefined);
}
