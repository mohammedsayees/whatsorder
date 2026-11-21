"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { getRealtimeAccessTokenAction } from "@/app/admin/alerts/actions";
import { updateUnreadConversationIds } from "@/lib/chat-unread";
import {
  parseConversationBroadcast,
  privateChannelConfig,
  restaurantChatsTopic
} from "@/lib/realtime-topics";

// Polling only backs up realtime. While the channel is live it is a slow
// safety net; the fast interval applies only while realtime is unavailable.
const fallbackRefreshIntervalMs = 60 * 1_000;
const liveReconcileIntervalMs = 5 * 60 * 1_000;
const realtimeTokenRefreshIntervalMs = 30 * 60 * 1_000;

type ConnectionState = "connecting" | "live" | "offline";

async function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anonKey) {
    return null;
  }

  // This badge sits in the admin layout, so a static import would put the
  // Supabase SDK in every admin route's critical bundle. Load it after
  // hydration instead; the server-rendered count is already on screen.
  const { createClient } = await import("@supabase/supabase-js");

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export function ChatUnreadNavBadge({
  initialUnreadConversationIds,
  realtimeAccessToken,
  restaurantId
}: {
  initialUnreadConversationIds: string[];
  realtimeAccessToken: string | null;
  restaurantId: string;
}) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [activeToken, setActiveToken] = useState(realtimeAccessToken);
  const [unreadConversationIds, setUnreadConversationIds] = useState(
    initialUnreadConversationIds
  );
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");

  useEffect(() => {
    let active = true;
    void createBrowserSupabaseClient()
      .then((client) => {
        if (active) {
          setSupabase(client);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // A plain GET, not a server action: actions run one at a time per tab and
    // this poll must never hold up a button staff just tapped.
    const refresh = () => {
      void fetch("/admin/alerts/unread-chats", {
        cache: "no-store",
        credentials: "same-origin"
      })
        .then((response) =>
          response.ok
            ? (response.json() as Promise<{ conversationIds?: string[] }>)
            : null
        )
        .then((payload) => {
          if (payload && Array.isArray(payload.conversationIds)) {
            setUnreadConversationIds(payload.conversationIds);
          }
        })
        .catch(() => undefined);
    };
    // Hidden tabs (e.g. a kitchen tablet left on another screen) skip polls
    // entirely and catch up once when staff come back.
    const refreshIfVisible = () => {
      if (document.visibilityState !== "hidden") {
        refresh();
      }
    };
    const interval = window.setInterval(
      refreshIfVisible,
      connectionState === "live" ? liveReconcileIntervalMs : fallbackRefreshIntervalMs
    );
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [connectionState]);

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

    const subscribe = async () => {
      try {
        await supabase.realtime.setAuth(activeToken);
        if (!active) {
          return;
        }

        // Private, per-restaurant Broadcast channel (src/lib/realtime-topics.ts).
        channel = supabase
          .channel(restaurantChatsTopic(restaurantId), privateChannelConfig)
          .on("broadcast", { event: "conversation_changed" }, ({ payload }) => {
            const conversation = parseConversationBroadcast(payload);
            if (conversation) {
              setUnreadConversationIds((current) =>
                updateUnreadConversationIds(current, conversation)
              );
            }
          })
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
        // The periodic server reconciliation remains available if realtime is offline.
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
  }, [activeToken, restaurantId, supabase]);

  const unreadCount = unreadConversationIds.length;
  if (unreadCount === 0) {
    return null;
  }

  const label = `${unreadCount} unread chat${unreadCount === 1 ? "" : "s"}`;

  return (
    <span
      aria-label={label}
      className="absolute right-1 top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-black leading-none text-white shadow-sm lg:static lg:ml-auto lg:min-w-6 lg:text-[11px]"
      title={label}
    >
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  );
}
