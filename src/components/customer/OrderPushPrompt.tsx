"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, CheckCircle2, Loader2 } from "lucide-react";

type PromptState =
  | "checking"
  | "unsupported"
  | "available"
  | "enabling"
  | "enabled"
  | "blocked"
  | "error";

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return new Uint8Array(bytes.buffer);
}

async function saveSubscription(input: {
  orderId: string;
  restaurantSlug: string;
  subscription: PushSubscription;
}) {
  const response = await fetch("/api/push/subscriptions", {
    body: JSON.stringify({
      orderId: input.orderId,
      restaurantSlug: input.restaurantSlug,
      subscription: input.subscription.toJSON()
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error("Push subscription could not be saved.");
  }
}

export function OrderPushPrompt({
  orderId,
  publicKey,
  restaurantSlug
}: {
  orderId: string;
  publicKey: string;
  restaurantSlug: string;
}) {
  const [state, setState] = useState<PromptState>("checking");

  useEffect(() => {
    let cancelled = false;

    async function inspectSupport() {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        setState("unsupported");
        return;
      }

      if (Notification.permission === "denied") {
        setState("blocked");
        return;
      }

      if (Notification.permission !== "granted") {
        setState("available");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
          await saveSubscription({ orderId, restaurantSlug, subscription });
        }

        if (!cancelled) {
          setState(subscription ? "enabled" : "available");
        }
      } catch {
        if (!cancelled) {
          setState("error");
        }
      }
    }

    void inspectSupport();
    return () => {
      cancelled = true;
    };
  }, [orderId, restaurantSlug]);

  async function enableNotifications() {
    setState("enabling");

    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "available");
        return;
      }

      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          applicationServerKey: applicationServerKey(publicKey),
          userVisibleOnly: true
        }));
      await saveSubscription({ orderId, restaurantSlug, subscription });
      setState("enabled");
    } catch {
      setState("error");
    }
  }

  if (state === "checking" || state === "unsupported") {
    return null;
  }

  if (state === "enabled") {
    return (
      <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm text-emerald-900">
        <p className="flex items-center gap-2 font-black">
          <CheckCircle2 size={17} /> Order notifications enabled
        </p>
        <p className="mt-1">We’ll notify this device when your order status changes.</p>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm">
      <p className="flex items-center gap-2 font-black text-ink">
        {state === "blocked" ? <BellOff size={18} /> : <Bell size={18} />}
        Get order updates
      </p>
      <p className="mt-1 text-sm leading-6 text-stone-600">
        {state === "blocked"
          ? "Notifications are blocked in this browser’s settings."
          : state === "error"
            ? "Notifications could not be enabled. You can try again."
            : "Enable free notifications for this order. No marketing messages are included."}
      </p>
      {state !== "blocked" ? (
        <button
          className="focus-ring mt-3 inline-flex items-center gap-2 rounded-full bg-leaf px-4 py-2 text-sm font-black text-white disabled:opacity-60"
          disabled={state === "enabling"}
          onClick={enableNotifications}
          type="button"
        >
          {state === "enabling" ? <Loader2 className="animate-spin" size={16} /> : <Bell size={16} />}
          {state === "enabling" ? "Enabling…" : "Enable notifications"}
        </button>
      ) : null}
    </div>
  );
}
