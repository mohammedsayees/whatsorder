import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { computeDailyNumbers } from "./metrics";
import type { DailyNumbers } from "./types";

const legacyNumbers: DailyNumbers = {
  summary_date: "2026-11-09",
  order_count: 4,
  gross_revenue: 80,
  avg_order_value: 20,
  prev_count: 3,
  last_week_count: 5,
  delta_vs_prev: 1,
  delta_vs_last_week: -1,
  dow_avg_count: 4,
  cancelled_count: 0,
  contact_capture_rate: 0.5,
  marketable_count: 1,
  top_item: { name: "Karak Tea", qty: 3 },
  top_combo: null,
  item_riser: null,
  item_faller: null,
  aov_this_week: 20,
  aov_prev_week: 20,
  busiest_hour: 9,
  deadest_hour: 15
};

describe("computeDailyNumbers", () => {
  it("combines coaching, top-item, and payment facts for one tenant day", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "daily_summary_numbers") {
        return { data: legacyNumbers, error: null };
      }
      if (name === "daily_coach_insights") {
        return {
          data: {
            summary_date: "2026-11-09",
            completed_order_count: 4,
            completed_sales: 80,
            avg_order_value: 20,
            previous_day_count: 3,
            last_week_count: 5,
            same_weekday_average: 4,
            cancelled_count: 1,
            contact_count: 2,
            marketable_count: 1,
            repeat_customer_orders: 2,
            new_customer_orders: 1,
            periods: [],
            location_insights: []
          },
          error: null
        };
      }
      return {
        data: {
          top_items: [
            { name: "Karak Tea", qty: 3 },
            { name: "Samosa", qty: 2 }
          ],
          payment_breakdown: {
            "Cash on Delivery": { orders: 3, sales: 60 },
            "Card on Delivery": { orders: 1, sales: 20 }
          }
        },
        error: null
      };
    });
    const admin = { rpc } as unknown as SupabaseClient;

    const result = await computeDailyNumbers(admin, "restaurant-1", "2026-11-09");

    expect(result).toMatchObject({
      order_count: 4,
      cancelled_count: 1,
      repeat_customer_orders: 2,
      new_customer_orders: 1,
      top_items: [
        { name: "Karak Tea", qty: 3 },
        { name: "Samosa", qty: 2 }
      ],
      payment_breakdown: {
        "Cash on Delivery": { orders: 3, sales: 60 },
        "Card on Delivery": { orders: 1, sales: 20 }
      }
    });
    expect(rpc).toHaveBeenCalledWith("daily_owner_report_insights", {
      rid: "restaurant-1",
      target_day: "2026-11-09"
    });
  });
});
