import { getSupabaseAdmin } from "@/lib/supabase";

// Server component, rendered only after the orders page resolves membership.
export async function NotificationDeliveryStatus({ restaurantId }: { restaurantId: string }) {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.from("order_notification_jobs")
    .select("id,order_id,channel,status,last_error")
    .eq("restaurant_id", restaurantId).eq("status", "failed")
    .order("created_at", { ascending: false }).limit(10);
  if (error) return <p role="status" className="my-3 text-sm text-amber-800">Notification delivery status is temporarily unavailable.</p>;
  if (!data?.length) return null;
  return <details className="my-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
    <summary className="cursor-pointer font-bold">Some customer notifications could not be sent</summary>
    <p className="mt-2 text-sm">Order and payment changes are saved. Contact the customer directly if needed.</p>
    <ul className="mt-2 text-sm">
      {data.map(job => <li key={job.id}>#{job.order_id.slice(-8).toUpperCase()} · {job.channel} · delivery failed</li>)}
    </ul>
  </details>;
}
