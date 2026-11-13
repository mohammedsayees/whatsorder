import "server-only";

import { getRestaurantLocalization } from "@/lib/localization";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { RestaurantLocalization } from "@/lib/types";

import { computeDailyNumbers } from "./metrics";
import { withDailyCoach } from "./coach";
import { narrate } from "./narrate";
import { resolveDailySummaryPhones } from "./recipients";
import { sendOwnerMessage } from "./send";

export type DailySummaryRunResult = {
  summary_date: string;
  processed: number;
  sent: number; // recipient messages accepted by the transport
  generated: number; // recap persisted, regardless of outbound delivery
  skipped_empty: number; // retained for compatibility; zero-order alerts are now sent
  already_done: number; // a non-failed run already existed (idempotency)
  failed: number;
  deferred: number; // not started before the time budget ran out; a later run picks them up
};

/** Restaurants summarised at once. Each is mostly waiting on the model call. */
export const DAILY_SUMMARY_CONCURRENCY = 5;
/**
 * Stop starting new restaurants after this long, leaving headroom inside the
 * route's 300 s maxDuration for the ones already running. Unstarted ones are
 * reported as `deferred`; the catch-up cron runs claim them (claims are
 * idempotent per restaurant and day).
 */
export const DAILY_SUMMARY_START_BUDGET_MS = 200_000;

/**
 * Run `work` over `items` with at most `concurrency` in flight, starting no
 * new item once `shouldStop()` is true. Returns how many were never started.
 */
export async function runWithBudget<T>(
  items: readonly T[],
  concurrency: number,
  shouldStop: () => boolean,
  work: (item: T) => Promise<void>
): Promise<number> {
  let next = 0;
  let notStarted = 0;
  const lane = async () => {
    while (next < items.length) {
      if (shouldStop()) {
        notStarted += items.length - next;
        next = items.length;
        return;
      }
      const item = items[next++];
      await work(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, lane)
  );
  return notStarted;
}

/**
 * A restaurant's local calendar date, optionally shifted by whole days.
 * Used to pin "yesterday" so the skip-check, the SQL aggregation, and the run-log
 * row all reference exactly the same day.
 */
export function restaurantDateString(
  now: Date,
  offsetDays = 0,
  restaurant?: Partial<RestaurantLocalization> | null
): string {
  const { time_zone } = getRestaurantLocalization(restaurant);
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: time_zone,
    year: "numeric"
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const localMidnight = new Date(
    `${values.get("year")}-${values.get("month")}-${values.get("day")}T00:00:00Z`
  );
  localMidnight.setUTCDate(localMidnight.getUTCDate() + offsetDays);
  return localMidnight.toISOString().slice(0, 10);
}

export function dubaiDateString(now: Date, offsetDays = 0): string {
  return restaurantDateString(now, offsetDays);
}

/**
 * Batch job (bounded concurrency, time-budgeted): one deterministic-numbers + narration + record per active, opted-in
 * restaurant for yesterday in that tenant's timezone. Each restaurant is isolated in its own
 * try/catch so a single café failing never kills the batch, and the unique
 * (restaurant_id, summary_date) constraint makes reruns idempotent.
 *
 * Runs with the service role (RLS bypassed) — every read is explicitly scoped to
 * one restaurant id; nothing here aggregates across tenants.
 */
export async function runDailySummary(options?: {
  targetDay?: string;
  now?: Date;
  startBudgetMs?: number;
  clock?: () => number;
}): Promise<DailySummaryRunResult> {
  const clock = options?.clock ?? Date.now;
  const startedAt = clock();
  const startBudgetMs = options?.startBudgetMs ?? DAILY_SUMMARY_START_BUDGET_MS;
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const now = options?.now ?? new Date();
  const defaultSummaryDate = options?.targetDay ?? dubaiDateString(now, -1);

  const { data: restaurants, error } = await admin
    .from("restaurants")
    .select("id, name, owner_phone, daily_summary_phone, daily_summary_phones, country_code, currency_code, locale, phone_country_code, time_zone, opening_hours_enabled, opening_hours")
    .eq("is_active", true)
    .eq("is_demo", false)
    .eq("daily_summary_enabled", true);

  if (error) {
    throw new Error(`Failed to load restaurants: ${error.message}`);
  }

  const result: DailySummaryRunResult = {
    summary_date: defaultSummaryDate,
    processed: 0,
    sent: 0,
    generated: 0,
    skipped_empty: 0,
    already_done: 0,
    failed: 0,
    deferred: 0
  };

  type SummaryRestaurant = NonNullable<typeof restaurants>[number];
  const summarise = async (restaurant: SummaryRestaurant) => {
    result.processed += 1;
    const summaryDate =
      options?.targetDay ?? restaurantDateString(now, -1, restaurant);

    let token: string | null = null;
    let deliveryStarted = false;
    try {
      const claim = await admin.rpc("claim_daily_summary", {
        target_restaurant_id: restaurant.id, target_day: summaryDate
      });
      if (claim.error) throw new Error("Daily summary claim failed");
      token = claim.data;
      if (!token) { result.already_done++; return; }
      const save = async (values: Record<string, unknown>) => {
        const saved = await admin.from("daily_summary_runs").update(values)
          .eq("restaurant_id", restaurant.id).eq("summary_date", summaryDate)
          .eq("lease_token", token).select("id");
        if (saved.error || !saved.data?.length) throw new Error("Daily summary record could not be saved");
      };
      const rawNumbers = await computeDailyNumbers(admin, restaurant.id, summaryDate);
      const numbers = withDailyCoach(rawNumbers, restaurant);
      const message = await narrate(numbers, restaurant.name, restaurant);
      // Commit the generated recap before attempting an external side effect.
      await save({ numbers, message_text: message, error: null });
      result.generated++;
      const phones = resolveDailySummaryPhones(restaurant);
      await save({ delivery_status: "sending" });
      deliveryStarted = true;
      const deliveries: Array<{
        phone: string | null;
        delivered: boolean;
        reason: string;
      }> = [];

      if (phones.length === 0) {
        deliveries.push({ phone: null, delivered: false, reason: "no_phone" });
      } else {
        for (const phone of phones) {
          try {
            const delivery = await sendOwnerMessage(
              restaurant.id,
              phone,
              message,
              restaurant.phone_country_code
            );
            deliveries.push({ phone, ...delivery });
          } catch (deliveryError) {
            console.error("Daily summary recipient delivery failed", {
              restaurantId: restaurant.id,
              recipientLast4: phone.slice(-4),
              error:
                deliveryError instanceof Error
                  ? deliveryError.message
                  : "Recipient delivery failed"
            });
            deliveries.push({ phone, delivered: false, reason: "delivery_error" });
          }
        }
      }

      const deliveredCount = deliveries.filter((delivery) => delivery.delivered).length;
      const hardFailure = deliveries.some((delivery) =>
        ["transport_failed", "delivery_error"].includes(delivery.reason)
      );
      const allDelivered = phones.length > 0 && deliveredCount === phones.length;
      const deliveryStatus = allDelivered
        ? "accepted"
        : deliveredCount > 0
          ? "partial"
          : hardFailure
            ? "failed"
            : "skipped";
      let deliveryReason = "accepted";
      if (!allDelivered && deliveries.length === 1) {
        deliveryReason = deliveries[0].reason;
      } else if (!allDelivered) {
        deliveryReason = `${deliveredCount}/${phones.length} accepted; ${deliveries
          .filter((delivery) => !delivery.delivered)
          .map((delivery) => delivery.reason)
          .join(", ")}`;
      }

      await save({
        status: deliveredCount === 0 && hardFailure ? "failed" : "generated",
        delivery_status: deliveryStatus,
        delivery_reason: deliveryReason,
        delivery_results: deliveries,
        lease_until: null
      });
      result.sent += deliveredCount;
      if (hardFailure) result.failed++;
    } catch (caught) {
      result.failed++;
      const message = caught instanceof Error ? caught.message : "Daily summary failed";
      console.error("Daily summary failed", { restaurantId: restaurant.id, error: message });
      if (token) {
        try {
        const logged = await admin.from("daily_summary_runs").update({ status: deliveryStarted ? "generated" : "failed", delivery_status: deliveryStarted ? "unknown" : "not_attempted", error: message, lease_until: null })
          .eq("restaurant_id", restaurant.id).eq("summary_date", summaryDate).eq("lease_token", token);
        if (logged.error) throw new Error("Log write failed");
        } catch {
          console.error("Daily summary failure could not be recorded", { restaurantId: restaurant.id });
        }
      }
    }
  };

  result.deferred = await runWithBudget(
    restaurants ?? [],
    DAILY_SUMMARY_CONCURRENCY,
    () => clock() - startedAt > startBudgetMs,
    summarise
  );
  if (result.deferred > 0) {
    console.warn("Daily summary deferred restaurants to the next run", {
      deferred: result.deferred
    });
  }
  return result;
}
