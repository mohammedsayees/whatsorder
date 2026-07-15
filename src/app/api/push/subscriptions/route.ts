import { NextResponse } from "next/server";
import { getRestaurantBySlug } from "@/lib/data";
import { getOrderPushAuthorization } from "@/lib/push-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

type SubscriptionBody = {
  orderId?: unknown;
  restaurantSlug?: unknown;
  subscription?: {
    endpoint?: unknown;
    keys?: { auth?: unknown; p256dh?: unknown };
  };
};

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

function validString(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

async function parseAndAuthorize(request: Request) {
  if (!sameOrigin(request)) {
    return { error: "Invalid request origin." } as const;
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 16_384) {
    return { error: "Subscription payload is too large." } as const;
  }

  let body: SubscriptionBody;
  try {
    body = (await request.json()) as SubscriptionBody;
  } catch {
    return { error: "Invalid subscription payload." } as const;
  }

  if (
    !validString(body.orderId, 36, 36) ||
    !validString(body.restaurantSlug, 1, 120)
  ) {
    return { error: "Invalid order." } as const;
  }

  const restaurant = await getRestaurantBySlug(body.restaurantSlug);
  const authorization = await getOrderPushAuthorization(body.orderId);

  if (
    !restaurant ||
    !authorization ||
    authorization.restaurantId !== restaurant.id
  ) {
    return { error: "Order authorization expired." } as const;
  }

  return { authorization, body, restaurant } as const;
}

export async function POST(request: Request) {
  const parsed = await parseAndAuthorize(request);

  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 403 });
  }

  const endpoint = parsed.body.subscription?.endpoint;
  const auth = parsed.body.subscription?.keys?.auth;
  const p256dh = parsed.body.subscription?.keys?.p256dh;

  if (
    !validString(endpoint, 12, 4096) ||
    !endpoint.startsWith("https://") ||
    !validString(auth, 8, 512) ||
    !validString(p256dh, 16, 512)
  ) {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Notifications are unavailable." }, { status: 503 });
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("id", parsed.authorization.orderId)
    .eq("restaurant_id", parsed.restaurant.id)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("customer_push_subscriptions").upsert(
    {
      auth,
      disabled_at: null,
      endpoint,
      failure_count: 0,
      marketing_consent_at: null,
      marketing_enabled: false,
      order_id: order.id,
      p256dh,
      restaurant_id: parsed.restaurant.id,
      transactional_enabled: true,
      updated_at: now
    },
    { onConflict: "restaurant_id,order_id,endpoint" }
  );

  if (error) {
    console.error("WhatsOrder push subscription save failed", {
      code: error.code,
      orderId: order.id,
      restaurantId: parsed.restaurant.id
    });
    return NextResponse.json({ error: "Could not enable notifications." }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function DELETE(request: Request) {
  const parsed = await parseAndAuthorize(request);

  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 403 });
  }

  const endpoint = parsed.body.subscription?.endpoint;
  if (!validString(endpoint, 12, 4096)) {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Notifications are unavailable." }, { status: 503 });
  }

  const { error } = await supabase
    .from("customer_push_subscriptions")
    .update({
      disabled_at: new Date().toISOString(),
      transactional_enabled: false,
      updated_at: new Date().toISOString()
    })
    .eq("restaurant_id", parsed.restaurant.id)
    .eq("order_id", parsed.authorization.orderId)
    .eq("endpoint", endpoint);

  if (error) {
    return NextResponse.json({ error: "Could not disable notifications." }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
