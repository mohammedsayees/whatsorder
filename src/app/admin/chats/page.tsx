import { MessageCircle } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { setChatStatusAction } from "@/app/admin/chats/actions";
import { ChatComposer } from "@/components/admin/chats/ChatComposer";
import { ChatRefreshButton } from "@/components/admin/chats/ChatRefreshButton";
import { ChatsLive } from "@/components/admin/chats/ChatsLive";
import { accessTokenCookieName } from "@/lib/auth-cookies";
import {
  getChatConversation,
  getChatConversations,
  getChatCustomerSnapshot,
  getChatMessages,
  isChatConversationFilter,
  serviceWindowRemainingMs,
  type ChatConversation,
  type ChatConversationFilter,
  type ChatMessage
} from "@/lib/chat-inbox";
import { getChatMediaSignedUrl } from "@/lib/chat-media";
import { formatCurrency } from "@/lib/currency";
import { formatRestaurantDate, formatRestaurantDateTime } from "@/lib/date-time";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

export const dynamic = "force-dynamic";

const FILTER_TABS: Array<{ value: ChatConversationFilter | "all"; label: string }> = [
  { value: "open", label: "Open" },
  { value: "unread", label: "Unread" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" }
];

function conversationLabel(conversation: ChatConversation) {
  return conversation.customer_name?.trim() || `+${conversation.customer_phone}`;
}

function windowBadge(lastInboundAt: string | null) {
  const remainingMs = serviceWindowRemainingMs(lastInboundAt);
  if (remainingMs <= 0) {
    return {
      label: "Reply window closed",
      className: "bg-stone-100 text-stone-500"
    };
  }
  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  return {
    label:
      hours > 0
        ? `Reply window: ${hours}h ${minutes}m left`
        : `Reply window: ${minutes}m left`,
    className: "bg-mint/20 text-leaf"
  };
}

function ChatMessageContent({
  message,
  mediaUrl
}: {
  message: ChatMessage;
  mediaUrl?: string;
}) {
  if (message.message_type === "text") {
    return (
      <p className="whitespace-pre-wrap text-sm font-medium [overflow-wrap:anywhere]">
        {message.body}
      </p>
    );
  }

  const caption = message.body ? (
    <p className="mt-1 whitespace-pre-wrap text-sm font-medium [overflow-wrap:anywhere]">
      {message.body}
    </p>
  ) : null;

  if (!mediaUrl) {
    return (
      <div>
        <p className="text-sm font-semibold italic text-stone-500">
          [{message.message_type}]
          {message.media_path ? "" : " — media unavailable"}
        </p>
        {caption}
      </div>
    );
  }

  const mime = message.media_mime ?? "";
  if (mime.startsWith("image/")) {
    return (
      <div>
        {/* Signed URLs expire hourly, so next/image optimization caching is
            counterproductive here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={message.body || "Image from customer"}
          className="max-h-64 max-w-full rounded-xl"
          src={mediaUrl}
        />
        {caption}
      </div>
    );
  }
  if (mime.startsWith("audio/")) {
    return (
      <div>
        <audio className="max-w-full" controls preload="none" src={mediaUrl} />
        {caption}
      </div>
    );
  }
  if (mime.startsWith("video/")) {
    return (
      <div>
        <video className="max-h-64 max-w-full rounded-xl" controls preload="none" src={mediaUrl} />
        {caption}
      </div>
    );
  }
  return (
    <div>
      <a
        className="focus-ring text-sm font-black text-leaf underline underline-offset-2"
        href={mediaUrl}
        rel="noreferrer"
        target="_blank"
      >
        Download {message.message_type}
        {message.body ? ` — ${message.body}` : ""}
      </a>
    </div>
  );
}

export default async function AdminChatsPage({
  searchParams
}: {
  searchParams: Promise<{ c?: string; filter?: string; q?: string }>;
}) {
  const [{ restaurant }, cookieStore, params] = await Promise.all([
    requireRestaurantRole(["restaurant_admin", "owner", "manager"]),
    cookies(),
    searchParams
  ]);
  const realtimeAccessToken =
    cookieStore.get(accessTokenCookieName)?.value ?? null;
  const filter: ChatConversationFilter | "all" = isChatConversationFilter(
    params.filter
  )
    ? params.filter
    : params.filter === "all"
      ? "all"
      : "open";

  const searchTerm = params.q?.trim() || undefined;
  const selectedId = params.c;
  const [conversations, selected] = await Promise.all([
    getChatConversations(
      restaurant.id,
      filter === "all" ? undefined : filter,
      searchTerm
    ),
    selectedId ? getChatConversation(restaurant.id, selectedId) : null
  ]);
  const [messages, customerSnapshot] = selected
    ? await Promise.all([
        getChatMessages(restaurant.id, selected.id),
        getChatCustomerSnapshot(restaurant.id, selected.customer_phone)
      ])
    : [[] as ChatMessage[], null];

  // Signed URLs for stored media (bucket is private; links live for an hour).
  const mediaUrls = new Map<string, string>();
  await Promise.all(
    messages
      .filter((message) => message.media_path)
      .map(async (message) => {
        const url = await getChatMediaSignedUrl(
          restaurant.id,
          message.media_path as string
        );
        if (url) {
          mediaUrls.set(message.id, url);
        }
      })
  );

  const formatDateTime = (value: string) =>
    formatRestaurantDateTime(value, restaurant);
  const badge = selected ? windowBadge(selected.last_inbound_at) : null;

  const listHref = (nextFilter: string, conversationId?: string) => {
    const query = new URLSearchParams();
    if (nextFilter !== "open") {
      query.set("filter", nextFilter);
    }
    if (searchTerm) {
      query.set("q", searchTerm);
    }
    if (conversationId) {
      query.set("c", conversationId);
    }
    const suffix = query.toString();
    return suffix ? `/admin/chats?${suffix}` : "/admin/chats";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink">Chats</h1>
          <p className="text-sm font-semibold text-stone-500">
            WhatsApp conversations on your connected number.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ChatsLive
            realtimeAccessToken={realtimeAccessToken}
            restaurantId={restaurant.id}
            selectedConversationId={selected?.id}
            selectedUnreadCount={selected?.unread_count}
          />
          <ChatRefreshButton />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form action="/admin/chats" className="flex items-center gap-2" method="get">
          {filter !== "open" ? (
            <input name="filter" type="hidden" value={filter} />
          ) : null}
          <input
            className="focus-ring w-48 rounded-full border border-stone-200 px-4 py-1.5 text-xs font-semibold"
            defaultValue={searchTerm ?? ""}
            name="q"
            placeholder="Search name or phone…"
            type="search"
          />
        </form>
        {FILTER_TABS.map((tab) => (
          <Link
            className={`focus-ring rounded-full px-4 py-1.5 text-xs font-black ${
              filter === tab.value
                ? "bg-ink text-white"
                : "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
            }`}
            href={listHref(tab.value)}
            key={tab.value}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
        {/* Conversation list */}
        <div className="min-w-0 rounded-3xl border border-stone-200 bg-white">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <MessageCircle className="h-8 w-8 text-stone-300" />
              <p className="text-sm font-bold text-stone-500">
                No conversations yet
              </p>
              <p className="text-xs font-semibold text-stone-400">
                Messages customers send to your WhatsApp number will appear
                here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    className={`block px-4 py-3 hover:bg-stone-50 ${
                      selected?.id === conversation.id ? "bg-stone-50" : ""
                    }`}
                    href={listHref(filter, conversation.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-black text-ink">
                        {conversationLabel(conversation)}
                      </span>
                      {conversation.id !== selected?.id &&
                      conversation.unread_count > 0 ? (
                        <span className="shrink-0 rounded-full bg-leaf px-2 py-0.5 text-[10px] font-black text-white">
                          {conversation.unread_count}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-stone-500">
                        {conversation.last_message_preview ?? "—"}
                      </span>
                      {conversation.status === "closed" ? (
                        <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-black text-stone-500">
                          Closed
                        </span>
                      ) : null}
                    </div>
                    {conversation.last_message_at ? (
                      <p className="mt-0.5 text-[11px] font-semibold text-stone-400">
                        {formatDateTime(conversation.last_message_at)}
                      </p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Thread */}
        <div className="flex min-h-[420px] min-w-0 flex-col rounded-3xl border border-stone-200 bg-white">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
              <MessageCircle className="h-8 w-8 text-stone-300" />
              <p className="text-sm font-bold text-stone-500">
                Select a conversation
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-5 py-3">
                <div>
                  <p className="text-sm font-black text-ink">
                    {conversationLabel(selected)}
                  </p>
                  <p className="text-xs font-semibold text-stone-500">
                    +{selected.customer_phone}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {badge ? (
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-black ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  ) : null}
                  <form action={setChatStatusAction}>
                    <input
                      name="conversationId"
                      type="hidden"
                      value={selected.id}
                    />
                    <input
                      name="status"
                      type="hidden"
                      value={selected.status === "open" ? "closed" : "open"}
                    />
                    <button
                      className="focus-ring rounded-full border border-stone-200 px-3 py-1 text-[11px] font-black text-stone-600 hover:bg-stone-50"
                      type="submit"
                    >
                      {selected.status === "open" ? "Close" : "Reopen"}
                    </button>
                  </form>
                </div>
              </div>

              {customerSnapshot ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-stone-100 bg-stone-50/60 px-5 py-2 text-xs font-semibold text-stone-600">
                  <span className="font-black text-ink">
                    {customerSnapshot.name || "Customer"}
                  </span>
                  <span>{customerSnapshot.total_orders} orders</span>
                  <span>
                    {formatCurrency(Number(customerSnapshot.total_spend), restaurant)}{" "}
                    spent
                  </span>
                  <span>{customerSnapshot.loyalty_points_balance} stamps</span>
                  {customerSnapshot.last_order_at ? (
                    <span>
                      Last order{" "}
                      {formatRestaurantDate(
                        customerSnapshot.last_order_at,
                        restaurant
                      )}
                    </span>
                  ) : null}
                  <Link
                    className="focus-ring font-black text-leaf underline-offset-2 hover:underline"
                    href={`/admin/customers?q=${encodeURIComponent(selected.customer_phone)}`}
                  >
                    View profile →
                  </Link>
                </div>
              ) : (
                <div className="border-b border-stone-100 bg-stone-50/60 px-5 py-2 text-xs font-semibold text-stone-400">
                  No orders yet from this number.
                </div>
              )}

              <div className="max-h-[60vh] flex-1 space-y-2 overflow-y-auto px-5 py-4">
                {messages.length === 0 ? (
                  <p className="text-center text-xs font-semibold text-stone-400">
                    No messages stored yet.
                  </p>
                ) : (
                  messages.map((message) => (
                    <div
                      className={`flex ${
                        message.direction === "outbound"
                          ? "justify-end"
                          : "justify-start"
                      }`}
                      key={message.id}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                          message.direction === "outbound"
                            ? "bg-mint text-ink"
                            : "bg-stone-100 text-ink"
                        }`}
                      >
                        <ChatMessageContent
                          mediaUrl={mediaUrls.get(message.id)}
                          message={message}
                        />
                        <p className="mt-1 text-right text-[10px] font-semibold text-stone-400">
                          {formatDateTime(message.created_at)}
                          {message.direction === "outbound" && message.status ? (
                            <span
                              className={`ml-1.5 ${
                                message.status === "read"
                                  ? "text-leaf"
                                  : message.status === "failed"
                                    ? "text-rose-500"
                                    : ""
                              }`}
                            >
                              {message.status === "sent"
                                ? "✓"
                                : message.status === "failed"
                                  ? "✕ failed"
                                  : "✓✓"}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-stone-100 px-5 py-4">
                <ChatComposer
                  conversationId={selected.id}
                  windowOpen={serviceWindowRemainingMs(selected.last_inbound_at) > 0}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
