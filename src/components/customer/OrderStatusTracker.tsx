"use client";

import { useEffect, useState } from "react";
import { Bike, CarFront, Check, Loader2, MapPin, Phone, XCircle } from "lucide-react";
import { formatDistance } from "@/lib/rider-location";
import { ARRIVAL_NOTE_MAX, canMarkArrived } from "@/lib/car-arrival";
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
    expectedReady: "Usually ready around",
    expectedDispatch: "Usually leaves the kitchen around",
    cancelledTitle: "This order was cancelled",
    cancelledBody: "Contact the restaurant if you have questions about it.",
    waitingTitle: "The restaurant hasn't confirmed yet",
    waitingBody:
      "If you haven't sent the order on WhatsApp yet, use the Send button above. You can also call the restaurant.",
    call: "Call restaurant",
    arrivedTitle: "Arrived at the restaurant?",
    arrivedHelp: "Tap below once you're parked and they'll bring your order to your car.",
    parkedLabel: "Where are you parked? (optional)",
    parkedPlaceholder: "Bay 3, in front of the pharmacy…",
    arrivedButton: "I've arrived",
    arrivedDone: "The restaurant knows you're outside",
    arrivedSince: "since",
    updateSpot: "Update parking spot",
    arrivedError: "Couldn't reach the restaurant. Try again or call them.",
    riderOnWay: (name: string) => `${name} is on the way`,
    callRider: (name: string) => `Call ${name}`,
    away: (distance: string) => `About ${distance} away`,
    liveLocation: "Live location",
    updated: (ago: string) => `updated ${ago}`,
    justNow: "just now",
    minutesAgo: (m: number) => `${m} min ago`,
    openMaps: "Open in Google Maps",
    noLiveLocation: "Live location appears here once your rider shares it."
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
    expectedReady: "عادةً يكون جاهزاً حوالي",
    expectedDispatch: "عادةً يغادر المطبخ حوالي",
    cancelledTitle: "تم إلغاء هذا الطلب",
    cancelledBody: "تواصل مع المطعم إذا كان لديك أي استفسار.",
    waitingTitle: "لم يؤكد المطعم طلبك بعد",
    waitingBody: "إذا لم ترسل الطلب عبر واتساب بعد، استخدم زر الإرسال أعلاه. يمكنك أيضاً الاتصال بالمطعم.",
    call: "اتصل بالمطعم",
    arrivedTitle: "وصلت إلى المطعم؟",
    arrivedHelp: "اضغط أدناه بعد أن تركن سيارتك وسيحضرون طلبك إليها.",
    parkedLabel: "أين ركنت سيارتك؟ (اختياري)",
    parkedPlaceholder: "الموقف 3، أمام الصيدلية…",
    arrivedButton: "لقد وصلت",
    arrivedDone: "المطعم يعلم أنك في الخارج",
    arrivedSince: "منذ",
    updateSpot: "تحديث مكان الوقوف",
    arrivedError: "تعذر إبلاغ المطعم. حاول مرة أخرى أو اتصل بهم.",
    riderOnWay: (name: string) => `${name} في الطريق إليك`,
    callRider: (name: string) => `اتصل بـ ${name}`,
    away: (distance: string) => `على بعد حوالي ${distance}`,
    liveLocation: "الموقع المباشر",
    updated: (ago: string) => `تم التحديث ${ago}`,
    justNow: "الآن",
    minutesAgo: (m: number) => `قبل ${m} دقيقة`,
    openMaps: "افتح في خرائط Google",
    noLiveLocation: "سيظهر الموقع المباشر هنا عندما يشاركه المندوب."
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
  onStatusChange,
  orderId,
  prepMinutes = null,
  restaurantId
}: {
  callHref: string | null;
  initial: OrderProgressSnapshot;
  language: CustomerLanguage;
  /** Tells the page when the polled status changes (its header follows it). */
  onStatusChange?: (status: OrderProgressSnapshot["status"]) => void;
  orderId: string;
  /** Restaurant's measured median prep time, or null without history. */
  prepMinutes?: number | null;
  restaurantId: string;
}) {
  const copy = COPY[language];
  const [snapshot, setSnapshot] = useState(initial);
  // Null until mounted: times and the wait check use the customer's clock,
  // which the server render cannot know.
  const [now, setNow] = useState<Date | null>(null);
  const active = isOrderActive(snapshot.status);
  useEffect(() => {
    onStatusChange?.(snapshot.status);
  }, [onStatusChange, snapshot.status]);

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
  // Once accepted and until ready: acceptance time + measured prep time.
  const acceptedAt = times[1] ? Date.parse(times[1]) : Number.NaN;
  const expectedReadyAt =
    active && prepMinutes !== null && (reached === 1 || reached === 2) && Number.isFinite(acceptedAt)
      ? new Date(acceptedAt + prepMinutes * 60_000).toISOString()
      : null;
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

      {expectedReadyAt && formatTime(expectedReadyAt) ? (
        <p className="mt-4 rounded-xl bg-mint/60 px-3 py-2 text-sm font-bold text-leaf">
          {snapshot.fulfilment_type === "delivery" ? copy.expectedDispatch : copy.expectedReady}{" "}
          {formatTime(expectedReadyAt)}
        </p>
      ) : null}

      {waitingTooLong ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-black">{copy.waitingTitle}</p>
          <p className="mt-1 text-amber-900/80">{copy.waitingBody}</p>
          <div className="mt-3 flex flex-wrap gap-2">
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

      {snapshot.status === "Out for Delivery" && snapshot.rider ? (
        <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-black text-sky-900">
              <Bike size={17} />
              {copy.riderOnWay(snapshot.rider.name)}
            </p>
            {snapshot.rider.phone ? (
              <a
                className="focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-full bg-sky-700 px-3.5 py-2 text-sm font-black text-white"
                href={`tel:+${snapshot.rider.phone}`}
              >
                <Phone size={15} />
                {copy.callRider(snapshot.rider.name)}
              </a>
            ) : null}
          </div>
          {snapshot.rider.location ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sky-900/80">
                <span className="font-bold">
                  {snapshot.rider.location.distanceKm !== null
                    ? copy.away(formatDistance(snapshot.rider.location.distanceKm))
                    : copy.liveLocation}
                </span>
                {now ? (
                  <span>
                    {" · "}
                    {copy.updated(
                      now.getTime() - Date.parse(snapshot.rider.location.updatedAt) < 60_000
                        ? copy.justNow
                        : copy.minutesAgo(
                            Math.floor((now.getTime() - Date.parse(snapshot.rider.location.updatedAt)) / 60_000)
                          )
                    )}
                  </span>
                ) : null}
              </p>
              <a
                className="focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-full border border-sky-300 bg-white px-3.5 py-2 text-sm font-black text-sky-800"
                href={snapshot.rider.location.mapsUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                <MapPin size={15} />
                {copy.openMaps}
              </a>
            </div>
          ) : (
            <p className="mt-2 text-sky-900/70">{copy.noLiveLocation}</p>
          )}
        </div>
      ) : null}

      {canMarkArrived(snapshot) ? (
        <CarArrivalPanel
          copy={copy}
          formatTime={formatTime}
          onArrived={(arrival) => setSnapshot((current) => ({ ...current, ...arrival }))}
          orderId={orderId}
          restaurantId={restaurantId}
          snapshot={snapshot}
        />
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

function CarArrivalPanel({
  copy,
  formatTime,
  onArrived,
  orderId,
  restaurantId,
  snapshot
}: {
  copy: Copy;
  formatTime: (value: string | null) => string | null;
  onArrived: (arrival: { customer_arrived_at: string; customer_arrival_note: string | null }) => void;
  orderId: string;
  restaurantId: string;
  snapshot: OrderProgressSnapshot;
}) {
  const arrivedAt = snapshot.customer_arrived_at ?? null;
  const [note, setNote] = useState(snapshot.customer_arrival_note ?? "");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const send = async () => {
    setPending(true);
    setFailed(false);

    try {
      const response = await fetch("/api/customer/order-arrived", {
        body: JSON.stringify({ restaurantId, orderId, note }),
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        method: "POST"
      });

      if (!response.ok) {
        setFailed(true);
        return;
      }

      onArrived(
        (await response.json()) as {
          customer_arrived_at: string;
          customer_arrival_note: string | null;
        }
      );
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  const noteChanged = (snapshot.customer_arrival_note ?? "") !== note.trim();

  return (
    <div
      className={`mt-4 rounded-xl border p-3 text-sm ${
        arrivedAt ? "border-emerald-200 bg-emerald-50" : "border-violet-200 bg-violet-50"
      }`}
    >
      {arrivedAt ? (
        <p className="flex items-center gap-2 font-black text-emerald-800">
          <Check size={16} strokeWidth={3} />
          {copy.arrivedDone}
          {formatTime(arrivedAt) ? (
            <span className="font-semibold text-emerald-700">
              {copy.arrivedSince} {formatTime(arrivedAt)}
            </span>
          ) : null}
        </p>
      ) : (
        <>
          <p className="flex items-center gap-2 font-black text-violet-900">
            <CarFront size={16} />
            {copy.arrivedTitle}
          </p>
          <p className="mt-1 text-violet-900/75">{copy.arrivedHelp}</p>
        </>
      )}
      <label className="mt-3 block">
        <span className="text-xs font-bold text-stone-600">{copy.parkedLabel}</span>
        <input
          className="focus-ring mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-base sm:text-sm"
          maxLength={ARRIVAL_NOTE_MAX}
          onChange={(event) => setNote(event.target.value)}
          placeholder={copy.parkedPlaceholder}
          value={note}
        />
      </label>
      {!arrivedAt || noteChanged ? (
        <button
          className={`focus-ring mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 font-black disabled:opacity-60 ${
            arrivedAt ? "border border-emerald-300 bg-white text-emerald-800" : "bg-violet-700 text-white"
          }`}
          disabled={pending}
          onClick={send}
          type="button"
        >
          {pending ? <Loader2 className="animate-spin" size={16} /> : <CarFront size={16} />}
          {arrivedAt ? copy.updateSpot : copy.arrivedButton}
        </button>
      ) : null}
      {failed ? <p className="mt-2 font-semibold text-rose-700">{copy.arrivedError}</p> : null}
    </div>
  );
}
