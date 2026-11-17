import type { FulfilmentType } from "@/lib/types";

/**
 * Steps of the public ordering funnel, in order. Must match the check
 * constraint in supabase/migrations/20261119090000_customer_funnel_events.sql.
 */
export const FUNNEL_EVENTS = [
  "menu_view",
  "item_added",
  "search_used",
  "checkout_view",
  "checkout_blocked",
  "order_saved",
  "whatsapp_opened"
] as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/** Short machine reasons only: never free text, never customer input. */
export const CHECKOUT_BLOCK_REASONS = ["minimum_order", "closed", "out_of_range"] as const;

export type FunnelPayload = {
  restaurantId: string;
  sessionId: string;
  event: FunnelEvent;
  orderId?: string;
  detail?: string;
  fulfilmentType?: FulfilmentType;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION = /^[A-Za-z0-9_-]{16,64}$/;
const FULFILMENT_TYPES: readonly FulfilmentType[] = ["delivery", "takeaway", "car_pickup", "dine_in"];

/** Validates an untrusted beacon body; returns null for anything off-spec. */
export function parseFunnelPayload(value: unknown): FunnelPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const body = value as Record<string, unknown>;
  const { restaurantId, sessionId, event, orderId, detail, fulfilmentType } = body;

  if (typeof restaurantId !== "string" || !UUID.test(restaurantId)) return null;
  if (typeof sessionId !== "string" || !SESSION.test(sessionId)) return null;
  if (typeof event !== "string" || !(FUNNEL_EVENTS as readonly string[]).includes(event)) return null;
  if (orderId !== undefined && (typeof orderId !== "string" || !UUID.test(orderId))) return null;
  if (
    detail !== undefined &&
    (typeof detail !== "string" || !(CHECKOUT_BLOCK_REASONS as readonly string[]).includes(detail))
  ) {
    return null;
  }
  if (
    fulfilmentType !== undefined &&
    (typeof fulfilmentType !== "string" ||
      !(FULFILMENT_TYPES as readonly string[]).includes(fulfilmentType))
  ) {
    return null;
  }

  return {
    restaurantId: restaurantId.toLowerCase(),
    sessionId,
    event: event as FunnelEvent,
    ...(orderId ? { orderId: orderId.toLowerCase() } : {}),
    ...(detail ? { detail } : {}),
    ...(fulfilmentType ? { fulfilmentType: fulfilmentType as FulfilmentType } : {})
  };
}

/** Computed in the database from the saved order's real status. */
export type FunnelStepKey = FunnelEvent | "order_accepted";

/** Main path shown in reports; search and blocks are side metrics. */
export const FUNNEL_PATH: FunnelStepKey[] = [
  "menu_view",
  "item_added",
  "checkout_view",
  "order_saved",
  "whatsapp_opened",
  "order_accepted"
];

/**
 * Orders the summary rows along the main path and adds the share of the
 * previous step that continued (null for the first step or an empty step).
 */
export function buildFunnel(rows: { event_name: string; sessions: number | string }[]) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    counts.set(row.event_name, Number(row.sessions) || 0);
  }

  const steps = FUNNEL_PATH.map((event, index) => {
    const sessions = counts.get(event) ?? 0;
    // Acceptance is measured against saved orders: some customers send the
    // order on WhatsApp without tapping our button.
    const base = event === "order_accepted" ? "order_saved" : FUNNEL_PATH[index - 1];
    const previous = index === 0 ? null : counts.get(base) ?? 0;
    return {
      event,
      sessions,
      continuedPercent:
        previous === null || previous === 0 ? null : Math.round((sessions / previous) * 100)
    };
  });

  return {
    steps,
    searchSessions: counts.get("search_used") ?? 0,
    blockedSessions: counts.get("checkout_blocked") ?? 0
  };
}
