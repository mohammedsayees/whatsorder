import type { FulfilmentType, OrderStatus } from "@/lib/types";

/**
 * How long a "New" order may wait before the customer is told the restaurant
 * has not confirmed yet and is offered ways to reach it. A per-restaurant
 * setting can replace this once restaurants record their own prep times.
 */
export const ACCEPTANCE_WAIT_MINUTES = 10;

export type ProgressStep = "sent" | "accepted" | "preparing" | "ready" | "onTheWay" | "done";

export type StatusEvent = { to_status: OrderStatus; created_at: string };

/** What the live status poll returns: no items, totals or message text. */
export type OrderProgressSnapshot = {
  status: OrderStatus;
  created_at: string | null;
  fulfilment_type: FulfilmentType | null;
  status_events: StatusEvent[];
};

export function toOrderProgressSnapshot(order: OrderProgressSnapshot): OrderProgressSnapshot {
  return {
    status: order.status,
    created_at: order.created_at,
    fulfilment_type: order.fulfilment_type,
    status_events: order.status_events
  };
}

const STATUS_INDEX: Record<Exclude<OrderStatus, "Cancelled">, number> = {
  New: 0,
  Accepted: 1,
  Preparing: 2,
  "Ready to Serve": 3,
  "Out for Delivery": 3,
  Completed: 4
};

export function progressSteps(fulfilmentType: FulfilmentType | null): ProgressStep[] {
  return fulfilmentType === "delivery"
    ? ["sent", "accepted", "preparing", "onTheWay", "done"]
    : ["sent", "accepted", "preparing", "ready", "done"];
}

/** Index of the reached step, or null for a cancelled order. */
export function progressIndex(status: OrderStatus): number | null {
  return status === "Cancelled" ? null : STATUS_INDEX[status] ?? 0;
}

export function isOrderActive(status: OrderStatus) {
  return status !== "Completed" && status !== "Cancelled";
}

/**
 * When each step was first reached. "sent" is the order time; later steps use
 * the first status event at that step. Steps the restaurant skipped (for
 * example New straight to Ready) have no time.
 */
export function stepTimes(
  createdAt: string | null,
  events: StatusEvent[],
  stepCount: number
): (string | null)[] {
  const times: (string | null)[] = Array.from({ length: stepCount }, () => null);
  times[0] = createdAt;

  const ordered = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));

  for (const event of ordered) {
    const index = progressIndex(event.to_status);

    if (index !== null && index > 0 && index < stepCount && !times[index]) {
      times[index] = event.created_at;
    }
  }

  return times;
}

/** True when a New order has waited past the acceptance window. */
export function isAwaitingAcceptanceTooLong(
  status: OrderStatus,
  createdAt: string | null,
  now: Date,
  waitMinutes = ACCEPTANCE_WAIT_MINUTES
) {
  if (status !== "New" || !createdAt) {
    return false;
  }

  const created = Date.parse(createdAt);

  return Number.isFinite(created) && now.getTime() - created >= waitMinutes * 60_000;
}
