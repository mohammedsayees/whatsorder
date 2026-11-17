"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Square } from "lucide-react";
import { RIDER_SEND_INTERVAL_MS } from "@/lib/rider-location";

type State = "active" | "ended" | "replaced";

/**
 * Shares the rider's GPS while this page is open. Sends at most one
 * position every 20 s; stops by itself when the delivery ends or the order
 * is reassigned. Phones pause GPS when the screen locks, so the page asks
 * the rider to keep it open.
 */
export function RiderLocationSharer({ initialState, token }: { initialState: State; token: string }) {
  const [state, setState] = useState<State>(initialState);
  const [sharing, setSharing] = useState(false);
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);
  const lastSendRef = useRef(0);

  const stop = () => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setSharing(false);
  };

  useEffect(() => stop, []);

  const send = async (position: GeolocationPosition) => {
    const now = Date.now();

    if (now - lastSendRef.current < RIDER_SEND_INTERVAL_MS) {
      return;
    }

    lastSendRef.current = now;

    try {
      const response = await fetch("/api/rider/location", {
        body: JSON.stringify({
          token,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        }),
        headers: { "content-type": "application/json" },
        keepalive: true,
        method: "POST"
      });

      if (!response.ok) {
        setProblem(response.status === 400 ? "Location is too inaccurate. Move to open sky." : "Could not send your location. Retrying…");
        return;
      }

      const result = (await response.json()) as { state: State };
      setProblem(null);
      setLastSent(new Date());

      if (result.state !== "active") {
        setState(result.state);
        stop();
      }
    } catch {
      setProblem("No connection. Retrying…");
    }
  };

  const start = () => {
    setProblem(null);

    if (!navigator.geolocation) {
      setProblem("This browser cannot share location.");
      return;
    }

    lastSendRef.current = 0;
    setSharing(true);
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => void send(position),
      (error) => {
        setProblem(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Allow it in your browser settings and try again."
            : "Waiting for GPS…"
        );
        if (error.code === error.PERMISSION_DENIED) {
          stop();
        }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 }
    );
  };

  if (state !== "active") {
    return (
      <p className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4 font-bold text-stone-700">
        {state === "replaced"
          ? "This delivery was given to another rider. Location sharing is off."
          : "This delivery is finished. Location sharing is off. Thank you!"}
      </p>
    );
  }

  return (
    <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <p className="text-sm leading-6 text-stone-600">
        Share your live location so the customer can see you&apos;re on the way. It only works while this page is open,
        so keep your screen on during the delivery. Sharing stops automatically when the order is delivered.
      </p>
      {sharing ? (
        <>
          <p className="mt-4 flex items-center gap-2 font-black text-leaf">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-leaf" />
            Sharing your location
          </p>
          <p className="mt-1 text-sm text-stone-500">
            {lastSent ? `Last sent ${lastSent.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}` : "Getting GPS…"}
          </p>
          <button
            className="focus-ring mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-stone-300 px-5 py-3 font-black text-stone-700"
            onClick={stop}
            type="button"
          >
            <Square size={16} />
            Stop sharing
          </button>
        </>
      ) : (
        <button
          className="focus-ring mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-leaf px-5 py-3 font-black text-white"
          onClick={start}
          type="button"
        >
          {sharing ? <Loader2 className="animate-spin" size={18} /> : <MapPin size={18} />}
          Start sharing location
        </button>
      )}
      {problem ? <p className="mt-3 text-sm font-semibold text-amber-700">{problem}</p> : null}
    </section>
  );
}
