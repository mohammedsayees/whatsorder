"use client";

import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getRealtimeAccessTokenAction } from "@/app/admin/alerts/actions";

// Push-based live updates for /admin/chats: a postgres_changes subscription on
// whatsapp_messages (RLS-gated per subscriber) triggers a debounced
// router.refresh(), and inbound messages ring the same two-tone chime as new
// orders when the user's sound-alerts toggle is on. No polling — the manual
// Refresh button remains the fallback when the channel is offline.

const refreshDebounceMs = 800;
const realtimeTokenRefreshIntervalMs = 30 * 60 * 1_000;

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

function soundAlertsEnabled(restaurantId: string) {
  try {
    return (
      window.localStorage.getItem(`whatsorder-sound-alerts:${restaurantId}`) ===
      "true"
    );
  } catch {
    return false;
  }
}

// Same two-tone chime as the new-order alert, kept local so this component
// stays independent of the (much larger) NewOrderAlerts module.
function playChime() {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) {
    return;
  }
  const context = new AudioContextClass();
  try {
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
  } catch {
    void context.close();
  }
}

export function ChatsLive({
  restaurantId,
  realtimeAccessToken
}: {
  restaurantId: string;
  realtimeAccessToken: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(createBrowserSupabaseClient, []);
  const [activeToken, setActiveToken] = useState(realtimeAccessToken);
  const [live, setLive] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);

  // Keep the realtime JWT fresh — expired tokens silently drop the channel.
  useEffect(() => {
    const interval = window.setInterval(() => {
      void getRealtimeAccessTokenAction().then((access) => {
        if (access?.restaurantId === restaurantId) {
          setActiveToken(access.accessToken);
        }
      });
    }, realtimeTokenRefreshIntervalMs);
    return () => window.clearInterval(interval);
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId || !activeToken || !supabase) {
      return;
    }

    let active = true;
    let channel: RealtimeChannel | null = null;

    const scheduleRefresh = () => {
      if (refreshTimerRef.current !== null) {
        return;
      }
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        router.refresh();
      }, refreshDebounceMs);
    };

    const subscribe = async () => {
      try {
        await supabase.realtime.setAuth(activeToken);
        if (!active) {
          return;
        }
        channel = supabase
          .channel(`chats-live-${restaurantId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              filter: `restaurant_id=eq.${restaurantId}`,
              schema: "public",
              table: "whatsapp_messages"
            },
            (payload) => {
              if (payload.new.restaurant_id !== restaurantId) {
                return;
              }
              if (
                payload.new.direction === "inbound" &&
                soundAlertsEnabled(restaurantId)
              ) {
                playChime();
              }
              scheduleRefresh();
            }
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              filter: `restaurant_id=eq.${restaurantId}`,
              schema: "public",
              table: "whatsapp_messages"
            },
            () => scheduleRefresh()
          )
          .subscribe((status) => {
            if (active) {
              setLive(status === "SUBSCRIBED");
            }
          });
      } catch {
        if (active) {
          setLive(false);
        }
      }
    };

    void subscribe();

    return () => {
      active = false;
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [activeToken, restaurantId, router, supabase]);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black ${
        live ? "bg-mint text-leaf" : "bg-stone-100 text-stone-400"
      }`}
      title={
        live
          ? "New messages appear automatically."
          : "Live updates offline — use Refresh."
      }
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${live ? "bg-leaf" : "bg-stone-400"}`}
      />
      {live ? "Live" : "Offline"}
    </span>
  );
}
