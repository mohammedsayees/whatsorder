import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

export type DailySummaryCardData = {
  summary_date: string;
  status: string;
  delivery_status?: string;
  delivery_reason?: string | null;
  message_text: string | null;
  numbers: import("@/lib/daily-summary/types").DailyNumbers | null;
};

/**
 * The most recent daily insight recap for this restaurant, or null if none has
 * run yet / the table isn't reachable. Soft feature: absence simply hides the
 * dashboard card. Always tenant-scoped by restaurant id.
 */
export async function getLatestDailySummary(
  restaurantId: string
): Promise<DailySummaryCardData | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("daily_summary_runs")
    .select("summary_date, status, message_text, numbers, delivery_status, delivery_reason")
    .eq("restaurant_id", restaurantId)
    .order("summary_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as DailySummaryCardData;
}
