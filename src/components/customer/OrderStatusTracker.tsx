"use client";

import { useEffect, useState } from "react";
import { Check, MessageCircle, Phone, XCircle } from "lucide-react";
import type { CustomerLanguage } from "@/lib/customer-i18n";
import {
  isAwaitingAcceptanceTooLong,
  isOrderActive,
  progressIndex,
  progressSteps,
  stepTimes,
  type OrderProgressSnapshot,
  type ProgressStep
} from "@/lib/order-progress";
import type { FulfilmentType } from "@/lib/types";

const POLL_INTERVAL_MS = 15_000;

// Strings live here, not in customer-i18n, so they never reach the menu bundle.
const COPY = {
  en: {
    sent: "Order placed",
    accepted: "Accepted by the restaurant",
    preparing: "Preparing",
    onTheWay: "On the way",
    readyPickup: "Ready for pickup",
    readyCar: "Ready, coming to your car",
    readyTable: "Ready to serve",
    delivered: "Delivered",
    collected: "Collected",
    served: "Served",
    live: "Updates automatically",
    cancelledTitle: "This order was cancelled",
    cancelledBody: "Contact the restaurant if you have questions about it.",
    waitingTitle: "The restaurant hasn't confirmed yet",
    waitingBody:
      "If you haven't sent the order on WhatsApp, tap Send below. You can also call the restaurant.",
    send: "Send on WhatsApp",
    call: "Call restaurant"
  },
  ar: {
    sent: "تم تقديم الطلب",
    accepted: "قبل المطعم الطلب",
    preparing: "قيد التحضير",
    onTheWay: "في الطريق",
    readyPickup: "جاهز للاستلام",
    readyCar: "جاهز، في الطريق إلى سيارتك",
    readyTable: "جاهز للتقديم",
    delivered: "تم التوصيل",
    collected: "تم الاستلام",
    served: "تم التقديم",
    live: "يتم التحديث تلقائياً",
    cancelledTitle: "تم إلغاء هذا الطلب",
    cancelledBody: "تواصل مع المطعم إذا كان لديك أي استفسار.",
    waitingTitle: "لم يؤكد المطعم طلبك بعد",
    waitingBody: "إذا لم ترسل الطلب عبر واتساب بعد، اضغط إرسال أدناه. يمكنك أيضاً الاتصال بالمطعم.",
    send: "إرسال عبر واتساب",
    call: "اتصل بالمطعم"
  }
} as const;

type Copy = (typeof COPY)[CustomerLanguage];

function stepLabel(step: ProgressStep, fulfilment: FulfilmentType | null, copy: Copy) {
  switch (step) {
    case "sent":
      return copy.sent;
    case "accepted":
      return copy.accepted;
    case "preparing":
      return copy.preparing;
    case "onTheWay":
      return copy.onTheWay;
    case "ready":
      return fulfilment === "car_pickup"
        ? copy.readyCar
        : fulfilment === "dine_in"
          ? copy.readyTable
          : copy.readyPickup;
    case "done":
      return fulfilment === "delivery"
        ? copy.delivered
        : fulfilment === "dine_in"
          ? copy.served
          : copy.collected;
  }
}

export function OrderStatusTracker({
  callHref,
  initial,
  language,
  orderId,
  restaurantId,
  whatsappUrl
}: {
  callHref: string | null;
  initial: OrderProgressSnapshot;
  language: CustomerLanguage;
  orderId: string;
  restaurantId: string;
  whatsappUrl: string;
}) {
  const copy = COPY[language];
  const [snapshot, setSnapshot] = useState(initial);
  // Null until mounted: times and the wait check use the customer's clock,
  // which the server render cannot know.
  const [now, setNow] = useState<Date | null>(null);
  const active = isOrderActive(snapshot.status);

  useEffect(() => {
    setNow(new Date());
    const clock = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({ restaurantId, orderId });

    const refresh = async () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      try {
        const response = await fetch(`/api/customer/order-status?${params.toString()}`, {
          cache: "no-store",
          credentials: "same-origin"
        });

        if (!response.ok || cancelled) {
          return;
        }

        const next = (await response.json()) as OrderProgressSnapshot;

        if (!cancelled && next?.status) {
          setSnapshot(next);
        }
      } catch {
        // Offline or transient: the next tick retries.
      }
    };

    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active, orderId, restaurantId]);

  if (snapshot.status === "Cancelled") {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-start">
        <p className="flex items-center gap-2 font-black text-rose-800">
          <XCircle size={18} />
          {copy.cancelledTitle}
        </p>
        <p className="mt-1 text-sm text-rose-900/80">{copy.cancelledBody}</p>
        {callHref ? (
          <a
            className="focus-ring mt-3 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-black text-rose-800"
            href={callHref}
          >
            <Phone size={15} />
            {copy.call}
          </a>
        ) : null}
      </section>
    );
  }

  const steps = progressSteps(snapshot.fulfilment_type);
  const reached = progressIndex(snapshot.status) ?? 0;
  const times = stepTimes(snapshot.created_at, snapshot.status_events, steps.length);
  const waitingTooLong =
    now !== null && isAwaitingAcceptanceTooLong(snapshot.status, snapshot.created_at, now);
  const formatTime = (value: string | null) =>
    value && now
      ? new Date(value).toLocaleTimeString(language === "ar" ? "ar-AE" : "en-AE", {
          hour: "numeric",
          minute: "2-digit"
        })
      : null;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 text-start">
      <ol aria-live="polite" className="space-y-0">
        {steps.map((step, index) => {
          const done = index < reached || (index === reached && !active);
          const current = index === reached && active;
          const time = index <= reached ? formatTime(times[index]) : null;

          return (
            <li className="relative flex gap-3 pb-4 last:pb-0" key={step}>
              {index < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={`absolute start-[11px] top-6 h-[calc(100%-1.25rem)] w-0.5 ${
                    index < reached ? "bg-leaf" : "bg-stone-200"
                  }`}
                />
              ) : null}
              <span
                aria-hidden
                className={`relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                  done
                    ? "bg-leaf text-white"
                    : current
                      ? "bg-white ring-4 ring-leaf/25 after:h-2.5 after:w-2.5 after:animate-pulse after:rounded-full after:bg-leaf"
                      : "bg-stone-200"
                }`}
              >
                {done ? <Check size={14} strokeWidth={3} /> : null}
              </span>
              <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                <p
                  className={`text-sm ${
                    index <= reached ? "font-black text-ink" : "font-semibold text-stone-400"
                  }`}
                >
                  {stepLabel(step, snapshot.fulfilment_type, copy)}
                </p>
                {time ? <span className="shrink-0 text-xs text-stone-500">{time}</span> : null}
              </div>
            </li>
          );
        })}
      </ol>

      {waitingTooLong ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-black">{copy.waitingTitle}</p>
          <p className="mt-1 text-amber-900/80">{copy.waitingBody}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              className="focus-ring inline-flex items-center gap-2 rounded-full bg-leaf px-4 py-2 font-black text-white"
              href={whatsappUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              <MessageCircle size={15} />
              {copy.send}
            </a>
            {callHref ? (
              <a
                className="focus-ring inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white px-4 py-2 font-black text-amber-900"
                href={callHref}
              >
                <Phone size={15} />
                {copy.call}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {active ? (
        <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-stone-500">
          <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-leaf" />
          {copy.live}
        </p>
      ) : null}
    </section>
  );
}
