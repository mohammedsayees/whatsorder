import type { FulfilmentType, OrderStatus } from "@/lib/types";

/** Orders a customer can still be waiting outside for. */
export const ARRIVAL_ACTIVE_STATUSES: readonly OrderStatus[] = [
  "New",
  "Accepted",
  "Preparing",
  "Ready to Serve"
];

export const ARRIVAL_NOTE_MAX = 80;

export function canMarkArrived(order: {
  fulfilment_type: FulfilmentType | null;
  status: OrderStatus;
}) {
  return order.fulfilment_type === "car_pickup" && ARRIVAL_ACTIVE_STATUSES.includes(order.status);
}

/**
 * Cleans the optional "where are you parked" note: single line, no control
 * characters, at most 80 characters. Returns null when nothing is left.
 */
export function normalizeArrivalNote(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ARRIVAL_NOTE_MAX)
    .trim();

  return cleaned || null;
}

export type WaitingArrival = {
  id: string;
  car_plate_number: string | null;
  car_description: string | null;
  customer_arrival_note: string | null;
  customer_arrived_at: string;
};

/** "just now", "3 min" or "1 h 5 min" since the customer arrived. */
export function waitingLabel(arrivedAt: string, now: Date) {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(arrivedAt)) / 60_000));

  if (!Number.isFinite(minutes) || minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
