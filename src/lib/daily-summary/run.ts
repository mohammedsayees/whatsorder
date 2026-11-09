import "server-only";

import { getRestaurantLocalization } from "@/lib/localization";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { RestaurantLocalization } from "@/lib/types";

import { computeDailyNumbers } from "./metrics";
import { withDailyCoach } from "./coach";
import { narrate } from "./narrate";
import { sendOwnerMessage } from "./send";

export type DailySummaryRunResult = {
  summary_date: string;
  processed: number;
  sent: number; // accepted by the transport
  generated: number; // recap persisted, regardless of outbound delivery
  skipped_empty: number; // zero-order day (still produces an encouraging line)
  already_done: number; // a non-failed run already existed (idempotency)
  failed: number;
};

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
 * Batch job: one deterministic-numbers + narration + record per active, opted-in
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
}): Promise<DailySummaryRunResult> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const now = options?.now ?? new Date();
  const defaultSummaryDate = options?.targetDay ?? dubaiDateString(now, -1);

  const { data: restaurants, error } = await admin
    .from("restaurants")
    .select("id, name, owner_phone, daily_summary_phone, country_code, currency_code, locale, phone_country_code, time_zone, opening_hours_enabled, opening_hours")
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
    failed: 0
  };

  for (const restaurant of restaurants ?? []) {
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
      if (!token) { result.already_done++; continue; }
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
      if (numbers.order_count === 0) {
        await save({ status: "skipped_empty", delivery_status: "skipped", delivery_reason: "empty_day", lease_until: null });
        result.skipped_empty++;
        continue;
      }
      const phone = restaurant.daily_summary_phone ?? restaurant.owner_phone ?? null;
      await save({ delivery_status: "sending" });
      deliveryStarted = true;
      const delivery = await sendOwnerMessage(restaurant.id, phone, message, restaurant.phone_country_code);
      await save({
        status: delivery.reason === "transport_failed" ? "failed" : "generated",
        delivery_status: delivery.delivered ? "accepted" : delivery.reason === "transport_failed" ? "failed" : "skipped",
        delivery_reason: delivery.reason, lease_until: null
      });
      if (delivery.delivered) result.sent++;
      if (delivery.reason === "transport_failed") result.failed++;
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
  }
  return result;
}
