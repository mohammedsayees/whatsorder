import type { OrderStatus } from "@/lib/types";

/**
 * Measured preparation time: how long a restaurant actually takes from
 * accepting an order to marking it Ready / Out for Delivery, taken from the
 * status history it already records. No owner setting is needed, and the
 * figure follows the kitchen as it gets faster or slower.
 */

export const PREP_WINDOW_DAYS = 28;
/** Below this many timed orders the median is noise; show nothing. */
export const MIN_PREP_SAMPLES = 8;
/** Ignore obvious outliers: a tap made seconds apart, or an order left open. */
const MIN_PLAUSIBLE_MINUTES = 1;
const MAX_PLAUSIBLE_MINUTES = 120;

export type PrepEvent = {
  order_id: string;
  to_status: OrderStatus;
  created_at: string;
};

export type PrepEstimate = {
  /** Median minutes from acceptance to ready, rounded. */
  minutes: number;
  samples: number;
};

const READY_STATUSES: ReadonlySet<OrderStatus> = new Set(["Ready to Serve", "Out for Delivery"]);

export function computePrepEstimate(events: PrepEvent[]): PrepEstimate | null {
  const byOrder = new Map<string, { accepted: number | null; ready: number | null }>();

  for (const event of events) {
    const time = Date.parse(event.created_at);

    if (!Number.isFinite(time)) {
      continue;
    }

    const entry = byOrder.get(event.order_id) ?? { accepted: null, ready: null };

    if (event.to_status === "Accepted") {
      entry.accepted = entry.accepted === null ? time : Math.min(entry.accepted, time);
    } else if (READY_STATUSES.has(event.to_status)) {
      entry.ready = entry.ready === null ? time : Math.min(entry.ready, time);
    }

    byOrder.set(event.order_id, entry);
  }

  const durations: number[] = [];

  for (const { accepted, ready } of byOrder.values()) {
    if (accepted === null || ready === null || ready <= accepted) {
      continue;
    }

    const minutes = (ready - accepted) / 60_000;

    if (minutes >= MIN_PLAUSIBLE_MINUTES && minutes <= MAX_PLAUSIBLE_MINUTES) {
      durations.push(minutes);
    }
  }

  if (durations.length < MIN_PREP_SAMPLES) {
    return null;
  }

  durations.sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  const median =
    durations.length % 2 === 0
      ? (durations[middle - 1] + durations[middle]) / 2
      : durations[middle];

  return { minutes: Math.max(1, Math.round(median)), samples: durations.length };
}

/**
 * Customer-facing range around the median, e.g. 12 -> "10–15". Rounded to
 * five-minute steps above ten minutes so it reads as an honest estimate
 * rather than a promise.
 */
export function prepRangeLabel(minutes: number): string {
  if (minutes <= 5) {
    return "3–5";
  }

  if (minutes <= 10) {
    return `${Math.max(3, minutes - 2)}–${minutes + 2}`;
  }

  const low = Math.floor(minutes / 5) * 5;
  const high = low + 5;
  return `${low}–${high}`;
}
