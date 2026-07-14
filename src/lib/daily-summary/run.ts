import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

import { computeDailyNumbers } from "./metrics";
import { narrate } from "./narrate";
import { sendOwnerMessage } from "./send";

export type DailySummaryRunResult = {
  summary_date: string;
  processed: number;
  sent: number; // summary produced + recorded
  skipped_empty: number; // zero-order day (still produces an encouraging line)
  already_done: number; // a non-failed run already existed (idempotency)
  failed: number;
};

/**
 * The Asia/Dubai (UTC+4, no DST) local date, optionally shifted by whole days.
 * Used to pin "yesterday" so the skip-check, the SQL aggregation, and the run-log
 * row all reference exactly the same day.
 */
export function dubaiDateString(now: Date, offsetDays = 0): string {
  const shifted = new Date(now.getTime() + 4 * 3600 * 1000);
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Batch job: one deterministic-numbers + narration + record per active, opted-in
 * restaurant for yesterday (Asia/Dubai). Each restaurant is isolated in its own
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

  const summaryDate = options?.targetDay ?? dubaiDateString(options?.now ?? new Date(), -1);

  const { data: restaurants, error } = await admin
    .from("restaurants")
    .select("id, name, owner_phone, daily_summary_phone")
    .eq("is_active", true)
    .eq("daily_summary_enabled", true);

  if (error) {
    throw new Error(`Failed to load restaurants: ${error.message}`);
  }

  const result: DailySummaryRunResult = {
    summary_date: summaryDate,
    processed: 0,
    sent: 0,
    skipped_empty: 0,
    already_done: 0,
    failed: 0
  };

  for (const restaurant of restaurants ?? []) {
    result.processed += 1;

    try {
      const { data: existing } = await admin
        .from("daily_summary_runs")
        .select("status")
        .eq("restaurant_id", restaurant.id)
        .eq("summary_date", summaryDate)
        .maybeSingle();

      // Idempotency: a prior non-failed run for this day means we're done. A
      // prior "failed" row is allowed to retry.
      if (existing && existing.status !== "failed") {
        result.already_done += 1;
        continue;
      }

      const numbers = await computeDailyNumbers(admin, restaurant.id, summaryDate);
      const status = numbers.order_count === 0 ? "skipped_empty" : "sent";
      const message = await narrate(numbers, restaurant.name);
      const phone = restaurant.daily_summary_phone ?? restaurant.owner_phone ?? null;

      await sendOwnerMessage(phone, message);

      await admin.from("daily_summary_runs").upsert(
        {
          restaurant_id: restaurant.id,
          summary_date: summaryDate,
          status,
          numbers,
          message_text: message,
          error: null
        },
        { onConflict: "restaurant_id,summary_date" }
      );

      if (status === "skipped_empty") {
        result.skipped_empty += 1;
      } else {
        result.sent += 1;
      }
    } catch (caught) {
      result.failed += 1;
      const message = caught instanceof Error ? caught.message : String(caught);
      console.error("WhatsOrder daily summary failed for restaurant", {
        restaurantId: restaurant.id,
        error: message
      });
      try {
        await admin.from("daily_summary_runs").upsert(
          {
            restaurant_id: restaurant.id,
            summary_date: summaryDate,
            status: "failed",
            error: message
          },
          { onConflict: "restaurant_id,summary_date" }
        );
      } catch {
        // Logging the failure must never itself break the batch.
      }
    }
  }

  return result;
}
