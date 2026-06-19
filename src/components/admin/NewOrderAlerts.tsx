"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { Bell, BellRing, Radio, Volume2, VolumeX } from "lucide-react";
import {
  getNewOrderAlertStateAction,
  getRealtimeAccessTokenAction
} from "@/app/admin/alerts/actions";

const highlightDurationMs = 9_000;
const repeatIntervalMs = 18_000;
const crossTabDedupeWindowMs = 30_000;
const realtimeTokenRefreshIntervalMs = 30 * 60 * 1_000;

type NewOrderAlertsContextValue = {
  highlightedOrderIds: ReadonlySet<string>;
};

const NewOrderAlertsContext = createContext<NewOrderAlertsContextValue>({
  highlightedOrderIds: new Set()
});

type NewOrderAlertsProviderProps = {
  children: React.ReactNode;
  initialNewOrderCount: number;
  realtimeAccessToken: string | null;
  restaurantId: string;
};

type ToastMessage = {
  id: number;
  message: string;
};

function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function storageBoolean(key: string) {
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function setStorageBoolean(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Sound alerts remain usable for this tab when storage is unavailable.
  }
}

function claimCrossTabSound(restaurantId: string, orderId: string) {
  try {
    // Best-effort cross-tab dedupe. TODO: use a tab-leader lease if simultaneous
    // localStorage claims become noticeable at high order volumes.
    const key = `whatsorder-order-alert-claimed:${restaurantId}:${orderId}`;
    const previousClaim = Number(window.localStorage.getItem(key) ?? 0);
    const now = Date.now();

    if (now - previousClaim < crossTabDedupeWindowMs) {
      return false;
    }

    window.localStorage.setItem(key, String(now));
    return true;
  } catch {
    return true;
  }
}

async function playSynthesizedChime() {
  const AudioContextClass = window.AudioContext;

  if (!AudioContextClass) {
    return false;
  }

  const context = new AudioContextClass();

  try {
    if (context.state === "suspended") {
      await context.resume();
    }

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.7);
    gain.connect(context.destination);

    const firstTone = context.createOscillator();
    firstTone.type = "sine";
    firstTone.frequency.setValueAtTime(740, context.currentTime);
    firstTone.connect(gain);
    firstTone.start(context.currentTime);
    firstTone.stop(context.currentTime + 0.28);

    const secondTone = context.createOscillator();
    secondTone.type = "sine";
    secondTone.frequency.setValueAtTime(988, context.currentTime + 0.25);
    secondTone.connect(gain);
    secondTone.start(context.currentTime + 0.25);
    secondTone.stop(context.currentTime + 0.7);

    window.setTimeout(() => {
      void context.close();
    }, 900);
    return true;
  } catch {
    void context.close();
    return false;
  }
}

export function NewOrderAlertsProvider({
  children,
  initialNewOrderCount,
  realtimeAccessToken,
  restaurantId
}: NewOrderAlertsProviderProps) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingOrderIdsRef = useRef(new Set<string>());
  const seenOrderIdsRef = useRef(new Set<string>());
  const soundEnabledRef = useRef(false);
  const toastSequenceRef = useRef(0);
  const [highlightedOrderIds, setHighlightedOrderIds] = useState<Set<string>>(new Set());
  const [newOrderCount, setNewOrderCount] = useState(initialNewOrderCount);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [connectionState, setConnectionState] = useState<"connecting" | "live" | "offline">(
    restaurantId && realtimeAccessToken && supabase ? "connecting" : "offline"
  );
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [activeRealtimeAccessToken, setActiveRealtimeAccessToken] =
    useState(realtimeAccessToken);
  const soundStorageKey = `whatsorder-sound-alerts:${restaurantId}`;
  const repeatStorageKey = `whatsorder-repeat-order-alerts:${restaurantId}`;

  useEffect(() => {
    const initializationTimer = window.setTimeout(() => {
      const storedSoundEnabled = storageBoolean(soundStorageKey);
      soundEnabledRef.current = storedSoundEnabled;
      setSoundEnabled(storedSoundEnabled);
      setRepeatEnabled(storageBoolean(repeatStorageKey));
    }, 0);
    audioRef.current = new Audio("/sounds/new-order.wav1");
    audioRef.current.preload = "auto";

    return () => {
      window.clearTimeout(initializationTimer);

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [repeatStorageKey, soundStorageKey]);

  const showToast = useCallback((message: string) => {
    toastSequenceRef.current += 1;
    const nextToast = { id: toastSequenceRef.current, message };
    setToast(nextToast);

    window.setTimeout(() => {
      setToast((current) => (current?.id === nextToast.id ? null : current));
    }, 6_000);
  }, []);

  const playAlertSound = useCallback(async () => {
    const audio = audioRef.current;

    if (audio) {
      try {
        audio.currentTime = 0;
        await audio.play();
        setSoundBlocked(false);
        return true;
      } catch {
        // A custom file may be missing, or the browser may require another user gesture.
      }
    }

    const fallbackPlayed = await playSynthesizedChime();
    setSoundBlocked(!fallbackPlayed);
    return fallbackPlayed;
  }, []);

  const refreshAlertState = useCallback(async () => {
    try {
      const state = await getNewOrderAlertStateAction([...pendingOrderIdsRef.current]);
      pendingOrderIdsRef.current = new Set(state.pendingOrderIds);
      setNewOrderCount(state.newOrderCount);
    } catch {
      // A stale/expired login should not crash the dashboard alert UI.
    }
  }, []);

  const refreshRealtimeAccess = useCallback(async () => {
    try {
      const access = await getRealtimeAccessTokenAction();

      if (!access || access.restaurantId !== restaurantId) {
        setConnectionState("offline");
        return;
      }

      setActiveRealtimeAccessToken(access.accessToken);
    } catch {
      setConnectionState("offline");
    }
  }, [restaurantId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshAlertState();
    }, 30_000);

    const handleFocus = () => {
      void refreshAlertState();
      void refreshRealtimeAccess();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshAlertState, refreshRealtimeAccess]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshRealtimeAccess();
    }, realtimeTokenRefreshIntervalMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshRealtimeAccess]);

  useEffect(() => {
    if (!restaurantId || !activeRealtimeAccessToken || !supabase) {
      return;
    }

    let active = true;
    let channel: RealtimeChannel | null = null;

    const subscribe = async () => {
      try {
        setConnectionState("connecting");
        await supabase.realtime.setAuth(activeRealtimeAccessToken);

        if (!active) {
          return;
        }

        channel = supabase
          .channel(`orders-alerts-${restaurantId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              filter: `restaurant_id=eq.${restaurantId}`,
              schema: "public",
              table: "orders"
            },
            (payload) => {
              const orderId = String(payload.new.id ?? "");

              if (
                !orderId ||
                payload.new.restaurant_id !== restaurantId ||
                seenOrderIdsRef.current.has(orderId)
              ) {
                return;
              }

              seenOrderIdsRef.current.add(orderId);
              if (seenOrderIdsRef.current.size > 500) {
                const oldestOrderId = seenOrderIdsRef.current.values().next().value;
                if (oldestOrderId) {
                  seenOrderIdsRef.current.delete(oldestOrderId);
                }
              }
              pendingOrderIdsRef.current.add(orderId);
              setNewOrderCount((count) => count + 1);
              setHighlightedOrderIds((current) => new Set(current).add(orderId));
              showToast("New order received");
              router.refresh();

              window.setTimeout(() => {
                setHighlightedOrderIds((current) => {
                  const next = new Set(current);
                  next.delete(orderId);
                  return next;
                });
              }, highlightDurationMs);

              if (soundEnabledRef.current && claimCrossTabSound(restaurantId, orderId)) {
                void playAlertSound();
              }
            }
          )
          .subscribe((status) => {
            if (!active) {
              return;
            }

            setConnectionState(
              status === "SUBSCRIBED"
                ? "live"
                : status === "CLOSED" ||
                    status === "CHANNEL_ERROR" ||
                    status === "TIMED_OUT"
                  ? "offline"
                  : "connecting"
            );
          });
      } catch {
        if (active) {
          setConnectionState("offline");
        }
      }
    };

    void subscribe();

    return () => {
      active = false;

      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [
    playAlertSound,
    activeRealtimeAccessToken,
    restaurantId,
    router,
    showToast,
    supabase
  ]);

  useEffect(() => {
    if (!repeatEnabled || !soundEnabled) {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const state = await getNewOrderAlertStateAction([...pendingOrderIdsRef.current]);
        pendingOrderIdsRef.current = new Set(state.pendingOrderIds);
        setNewOrderCount(state.newOrderCount);

        if (state.pendingOrderIds.length > 0) {
          await playAlertSound();
        }
      } catch {
        // Repeated alerts stop silently if the authenticated session is no longer available.
      }
    }, repeatIntervalMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [playAlertSound, repeatEnabled, soundEnabled]);

  const enableSound = async () => {
    soundEnabledRef.current = true;
    setSoundEnabled(true);
    setStorageBoolean(soundStorageKey, true);
    const played = await playAlertSound();
    showToast(played ? "Sound alerts enabled" : "Click Sound Alerts again to allow audio");
  };

  const disableSound = () => {
    soundEnabledRef.current = false;
    setSoundEnabled(false);
    setStorageBoolean(soundStorageKey, false);
    setSoundBlocked(false);
  };

  const changeRepeatSetting = (enabled: boolean) => {
    setRepeatEnabled(enabled);
    setStorageBoolean(repeatStorageKey, enabled);
  };

  const contextValue = useMemo(
    () => ({ highlightedOrderIds }),
    [highlightedOrderIds]
  );

  return (
    <NewOrderAlertsContext.Provider value={contextValue}>
      <div className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 sm:gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-mint px-3 py-2 text-sm font-black text-leaf">
            <BellRing size={16} />
            New Orders: {newOrderCount}
          </span>
          <button
            aria-pressed={soundEnabled && !soundBlocked}
            className={`focus-ring inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-black transition ${
              soundEnabled && !soundBlocked
                ? "bg-leaf text-white"
                : "border border-stone-300 bg-white text-stone-700 hover:border-leaf hover:text-leaf"
            }`}
            onClick={soundEnabled && !soundBlocked ? disableSound : enableSound}
            type="button"
          >
            {soundEnabled && !soundBlocked ? <Volume2 size={16} /> : <VolumeX size={16} />}
            {soundEnabled && !soundBlocked ? "Sound Alerts: ON" : "Enable Sound Alerts"}
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-stone-200 px-3 py-2 text-xs font-bold text-stone-600">
            <input
              checked={repeatEnabled}
              className="accent-leaf"
              disabled={!soundEnabled}
              onChange={(event) => changeRepeatSetting(event.target.checked)}
              type="checkbox"
            />
            Repeat until accepted
          </label>
          <span
            className={`ml-auto inline-flex items-center gap-1.5 text-xs font-bold ${
              connectionState === "live" ? "text-leaf" : "text-stone-500"
            }`}
            title={`Order alerts are ${connectionState}`}
          >
            <Radio size={14} />
            {connectionState === "live" ? "Live" : connectionState === "offline" ? "Offline" : "Connecting"}
          </span>
          {soundBlocked ? (
            <p className="w-full text-xs font-bold text-amber-700">
              Your browser blocked audio. Click “Enable Sound Alerts” to allow it.
            </p>
          ) : null}
        </div>
      </div>

      {children}

      {toast ? (
        <div
          aria-live="assertive"
          className="fixed right-4 top-20 z-50 flex max-w-sm items-center gap-3 rounded-xl bg-ink px-4 py-3 text-sm font-black text-white shadow-xl"
          role="status"
        >
          <Bell className="text-mint" size={20} />
          {toast.message}
        </div>
      ) : null}
    </NewOrderAlertsContext.Provider>
  );
}

export function NewOrderAlertCard({
  children,
  orderId
}: {
  children: React.ReactNode;
  orderId: string;
}) {
  const { highlightedOrderIds } = useContext(NewOrderAlertsContext);
  const highlighted = highlightedOrderIds.has(orderId);

  return (
    <article
      className={`rounded-lg border bg-white p-4 shadow-sm transition-all duration-500 ${
        highlighted
          ? "animate-pulse border-leaf ring-4 ring-mint"
          : "border-stone-200"
      }`}
      data-new-order-highlight={highlighted ? "true" : undefined}
    >
      {children}
    </article>
  );
}
