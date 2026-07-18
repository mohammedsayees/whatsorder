"use client";

import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import {
  getRealtimeAccessTokenAction,
  getUnreadChatConversationIdsAction
} from "@/app/admin/alerts/actions";
import { updateUnreadConversationIds } from "@/lib/chat-unread";

const fallbackRefreshIntervalMs = 60 * 1_000;
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

export function ChatUnreadNavBadge({
  initialUnreadConversationIds,
  realtimeAccessToken,
  restaurantId
}: {
  initialUnreadConversationIds: string[];
  realtimeAccessToken: string | null;
  restaurantId: string;
}) {
  const supabase = useMemo(createBrowserSupabaseClient, []);
  const [activeToken, setActiveToken] = useState(realtimeAccessToken);
  const [unreadConversationIds, setUnreadConversationIds] = useState(
    initialUnreadConversationIds
  );

  useEffect(() => {
    const refresh = () => {
      void getUnreadChatConversationIdsAction()
        .then(setUnreadConversationIds)
        .catch(() => undefined);
    };
    const interval = window.setInterval(refresh, fallbackRefreshIntervalMs);
    return () => window.clearInterval(interval);
  }, []);

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

    const applyConversationUpdate = (value: Record<string, unknown>) => {
      const id = typeof value.id === "string" ? value.id : null;
      const unreadCount = Number(value.unread_count);
      if (
        value.restaurant_id !== restaurantId ||
        !id ||
        !Number.isFinite(unreadCount)
      ) {
        return;
      }

      setUnreadConversationIds((current) =>
        updateUnreadConversationIds(current, {
          id,
          unread_count: unreadCount
        })
      );
    };

    const subscribe = async () => {
      try {
        await supabase.realtime.setAuth(activeToken);
        if (!active) {
          return;
        }

        channel = supabase
          .channel(`chat-nav-unread-${restaurantId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              filter: `restaurant_id=eq.${restaurantId}`,
              schema: "public",
              table: "whatsapp_conversations"
            },
            (payload) => applyConversationUpdate(payload.new)
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              filter: `restaurant_id=eq.${restaurantId}`,
              schema: "public",
              table: "whatsapp_conversations"
            },
            (payload) => applyConversationUpdate(payload.new)
          )
          .subscribe();
      } catch {
        // The periodic server reconciliation remains available if realtime is offline.
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
