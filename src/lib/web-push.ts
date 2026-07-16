import "server-only";

import webPush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { orderReference } from "@/lib/order-notifications";
import type { OrderStatus } from "@/lib/types";

type PushPayload = {
  title: string;
  body: string;
  icon: string;
  badge: string;
  tag: string;
  url: string;
};

type PushSubscriptionRow = {
  auth: string;
  endpoint: string;
  failure_count: number;
  id: string;
  p256dh: string;
  restaurant_id: string;
};

type SendOrderPushInput = {
  supabase: SupabaseClient | null;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    status_notifications_enabled?: boolean | null;
  };
  orderId: string;
  status: OrderStatus;
};

function configureWebPush(): boolean {
  const publicKey =
    process.env.WEB_PUSH_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_SUBJECT ?? "mailto:support@whatsorder.app";

  if (!publicKey || !privateKey) {
    return false;
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export function buildOrderPushPayload(input: {
  orderId: string;
  restaurantName: string;
  restaurantSlug: string;
  status: OrderStatus;
}): PushPayload | null {
  const reference = orderReference(input.orderId);
  const title = `${input.restaurantName} order update`;
  const common = {
    badge: "/icons/icon-192.png",
    icon: "/icons/icon-192.png",
    tag: `order-${input.orderId}`,
    title,
    url: `/r/${encodeURIComponent(input.restaurantSlug)}`
  };

  switch (input.status) {
    case "Accepted":
      return { ...common, body: `Order #${reference} was accepted.` };
    case "Ready to Serve":
      return { ...common, body: `Order #${reference} is ready to serve.` };
    case "Out for Delivery":
      return { ...common, body: `Order #${reference} is out for delivery.` };
    case "Completed":
      return { ...common, body: `Order #${reference} is complete. Thank you!` };
    case "Cancelled":
      return { ...common, body: `Order #${reference} was cancelled.` };
    default:
      return null;
  }
}

function pushStatusCode(error: unknown): number | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }

  return null;
}

async function sendToSubscription(
  supabase: SupabaseClient,
  subscription: PushSubscriptionRow,
  payload: PushPayload
): Promise<void> {
  try {
    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          auth: subscription.auth,
          p256dh: subscription.p256dh
        }
      },
      JSON.stringify(payload),
      { TTL: 24 * 60 * 60, urgency: "high" }
    );

    await supabase
      .from("customer_push_subscriptions")
      .update({
        failure_count: 0,
        last_success_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", subscription.id)
      .eq("restaurant_id", subscription.restaurant_id);
  } catch (error) {
    const statusCode = pushStatusCode(error);
    const expired = statusCode === 404 || statusCode === 410;
    await supabase
      .from("customer_push_subscriptions")
      .update({
        disabled_at: expired ? new Date().toISOString() : null,
        failure_count: subscription.failure_count + 1,
        updated_at: new Date().toISOString()
      })
      .eq("id", subscription.id)
      .eq("restaurant_id", subscription.restaurant_id);

    console.info("WhatsOrder Web Push was not delivered", {
      statusCode,
      subscriptionId: subscription.id
    });
  }
}

/** Best-effort customer Web Push. It never throws or blocks status persistence. */
export async function sendOrderStatusPushNotification(
  input: SendOrderPushInput
): Promise<void> {
  try {
    if (
      !input.supabase ||
      input.restaurant.status_notifications_enabled === false ||
      !configureWebPush()
    ) {
      return;
    }

    const payload = buildOrderPushPayload({
      orderId: input.orderId,
      restaurantName: input.restaurant.name,
      restaurantSlug: input.restaurant.slug,
      status: input.status
    });

    if (!payload) {
      return;
    }

    const { data, error } = await input.supabase
      .from("customer_push_subscriptions")
      .select("auth,endpoint,failure_count,id,p256dh,restaurant_id")
      .eq("restaurant_id", input.restaurant.id)
      .eq("order_id", input.orderId)
      .eq("transactional_enabled", true)
      .is("disabled_at", null);

    if (error) {
      console.info("WhatsOrder Web Push subscriptions could not be read", {
        code: error.code,
        orderId: input.orderId,
        restaurantId: input.restaurant.id
      });
      return;
    }

    await Promise.all(
      ((data ?? []) as PushSubscriptionRow[]).map((subscription) =>
        sendToSubscription(input.supabase as SupabaseClient, subscription, payload)
      )
    );
  } catch (error) {
    console.error("WhatsOrder Web Push failed", {
      message: error instanceof Error ? error.message : "unknown",
      orderId: input.orderId,
      restaurantId: input.restaurant.id,
      status: input.status
    });
  }
}
