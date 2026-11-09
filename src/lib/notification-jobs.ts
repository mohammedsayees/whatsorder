import "server-only";
import { after } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendOrderStatusNotification, type DeliveryResult } from "@/lib/order-notifications";
import { sendOrderStatusPushNotification } from "@/lib/web-push";
import type { OrderStatus } from "@/lib/types";

type Job = {
  id: string; restaurant_id: string; order_id: string; order_status: OrderStatus;
  channel: "whatsapp" | "push"; attempts: number; lease_token: string;
};

// The database trigger owns persistence. This is only a low-latency wake-up;
// cron recovers jobs if this process exits before the callback runs.
export function scheduleOrderNotifications(restaurantId: string) {
  after(async () => {
    try { await processOrderNotifications(restaurantId); }
    catch { console.error("Notification worker failed", { restaurantId }); }
  });
}

export async function processOrderNotifications(restaurantId?: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Notification service unavailable");
  const counts = { accepted: 0, skipped: 0, failed: 0 };
  const started = Date.now();
  for (let index = 0; index < 10 && Date.now() - started < 40000; index++) {
    const claim = await admin.rpc("claim_order_notification", {
      target_restaurant_id: restaurantId ?? null
    });
    if (claim.error) throw new Error("Notification claim failed");
    const job = claim.data?.[0] as Job | undefined;
    if (!job) break;
    let outcome: DeliveryResult;
    try {
      const { data: restaurant, error } = await admin.from("restaurants")
        .select("id,name,slug,phone_country_code,status_notifications_enabled,is_active")
        .eq("id", job.restaurant_id).maybeSingle();
      if (error) throw new Error("Restaurant lookup failed");
      const order = await admin.from("orders").select("status")
        .eq("restaurant_id", job.restaurant_id).eq("id", job.order_id).maybeSingle();
      if (order.error) throw new Error("Order lookup failed");
      // Do not deliver an obsolete status after a delayed retry.
      if (!restaurant?.is_active || order.data?.status !== job.order_status) {
        outcome = { status: "skipped", reason: "Order status superseded or restaurant inactive" };
      } else {
        const input = { supabase: admin, restaurant, orderId: job.order_id, status: job.order_status };
        outcome = job.channel === "whatsapp"
          ? await sendOrderStatusNotification(input)
          : await sendOrderStatusPushNotification(input);
      }
    } catch {
      outcome = { status: "failed", reason: "Delivery attempt failed" };
    }
    const retry = outcome.status === "failed" && job.attempts < 5;
    const saved = await admin.from("order_notification_jobs").update({
      status: retry ? "pending" : outcome.status,
      last_error: outcome.reason ?? null,
      available_at: new Date(Date.now() + 30000 * 2 ** job.attempts).toISOString(),
      lease_until: null, lease_token: null
    }).eq("restaurant_id", job.restaurant_id).eq("id", job.id)
      .eq("lease_token", job.lease_token).select("id");
    if (saved.error || !saved.data?.length) throw new Error("Notification outcome could not be recorded");
    counts[outcome.status]++;
  }
  return counts;
}
