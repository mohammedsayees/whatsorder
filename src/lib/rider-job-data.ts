import "server-only";

import { formatCurrency } from "@/lib/currency";
import { scheduleOrderNotifications } from "@/lib/notification-jobs";
import { orderReference } from "@/lib/order-notifications";
import { collectionPlan, type RiderActionRequest } from "@/lib/rider-cash";
import { RIDER_SHARING_STATUSES } from "@/lib/rider-location";
import { RIDER_TOKEN_PATTERN, hashRiderToken, type TrackingState } from "@/lib/rider-location-data";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { FulfilmentType, OrderStatus, PaymentMethod } from "@/lib/types";

// The rider's job screen. Like the location link, everything is resolved from
// the assignment the token's hash points at, and scoped by that assignment's
// own restaurant_id / order_id, never by anything the client sends.

export type RiderJobStage =
  | "waiting"
  | "ready"
  | "on_the_way"
  | "delivered"
  | "failed"
  | "replaced"
  | "closed";

export type RiderJob = {
  trackingState: TrackingState;
  stage: RiderJobStage;
  orderRef: string;
  restaurantName: string;
  deliveryArea: string | null;
  address: string | null;
  landmark: string | null;
  customerName: string;
  /** International digits for a tel: link. */
  customerPhone: string | null;
  navigateUrl: string | null;
  /** For formatting amounts the rider types. */
  currency: { code: string; locale: string };
  collection: {
    kind: "cash" | "card" | "none" | "blocked";
    due: number;
    dueLabel: string;
    note: string | null;
  };
  /** Cash the restaurant already gave the rider to make change for this order. */
  changeAdvanceLabel: string | null;
  result: {
    collectedLabel: string | null;
    changeLabel: string | null;
    failureReason: string | null;
  } | null;
};

type AssignmentRow = {
  id: string;
  restaurant_id: string;
  order_id: string;
  rider_id: string;
  outcome: "delivered" | "failed" | null;
  failure_reason: string | null;
  tendered_amount: number | string | null;
  collected_method: string | null;
};

type OrderRow = {
  status: OrderStatus;
  fulfilment_type: FulfilmentType | null;
  delivery_area: string | null;
  delivery_address: string | null;
  delivery_landmark: string | null;
  delivery_google_maps_url: string | null;
  customer_name: string;
  customer_phone: string | null;
  payment_method: PaymentMethod | null;
  total: number | string;
  online_payment_status: string | null;
};

function safeMapsUrl(order: OrderRow) {
  const stored = order.delivery_google_maps_url?.trim();

  if (stored && /^https:\/\//i.test(stored)) {
    return stored;
  }

  const address = [order.delivery_address, order.delivery_area].filter(Boolean).join(", ");

  return address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;
}

function stageFor(input: {
  trackingState: TrackingState;
  assignment: AssignmentRow;
  status: OrderStatus;
}): RiderJobStage {
  const { trackingState, assignment, status } = input;

  if (trackingState === "replaced") return "replaced";
  if (assignment.outcome === "delivered") return "delivered";
  if (status === "Completed" || status === "Cancelled") return "closed";
  if (assignment.outcome === "failed") return "failed";
  if (status === "Out for Delivery") return "on_the_way";
  if (status === "Preparing") return "ready";
  return "waiting";
}

/** What the rider's page shows. Null for an unknown link. */
export async function getRiderJob(token: string): Promise<RiderJob | null> {
  if (!RIDER_TOKEN_PATTERN.test(token)) {
    return null;
  }

  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error("unavailable");
  }

  const { data, error } = await admin
    .from("order_rider_assignments")
    .select("id,restaurant_id,order_id,rider_id,outcome,failure_reason,tendered_amount,collected_method")
    .eq("tracking_token_hash", hashRiderToken(token))
    .maybeSingle();

  if (error) {
    throw new Error("unavailable");
  }

  if (!data) {
    return null;
  }

  const assignment = data as AssignmentRow;
  const [latest, orderResult, restaurantResult, advances] = await Promise.all([
    admin
      .from("order_rider_assignments")
      .select("id")
      .eq("restaurant_id", assignment.restaurant_id)
      .eq("order_id", assignment.order_id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("orders")
      .select(
        "status,fulfilment_type,delivery_area,delivery_address,delivery_landmark,delivery_google_maps_url,customer_name,customer_phone,payment_method,total,online_payment_status"
      )
      .eq("restaurant_id", assignment.restaurant_id)
      .eq("id", assignment.order_id)
      .maybeSingle(),
    admin
      .from("restaurants")
      .select("name,country_code,currency_code,locale,phone_country_code,time_zone")
      .eq("id", assignment.restaurant_id)
      .maybeSingle(),
    admin
      .from("rider_cash_entries")
      .select("amount")
      .eq("restaurant_id", assignment.restaurant_id)
      .eq("rider_id", assignment.rider_id)
      .eq("order_id", assignment.order_id)
      .eq("entry_type", "change_advance")
  ]);

  if (latest.error || orderResult.error || restaurantResult.error || advances.error) {
    throw new Error("unavailable");
  }

  const order = orderResult.data as OrderRow | null;

  if (!order) {
    return null;
  }

  const restaurant = restaurantResult.data as
    | ({ name?: string } & Record<string, unknown>)
    | null;
  const money = (value: number) => formatCurrency(value, restaurant as never);

  const trackingState: TrackingState =
    (latest.data as { id: string } | null)?.id !== assignment.id
      ? "replaced"
      : RIDER_SHARING_STATUSES.includes(order.status) && order.fulfilment_type === "delivery"
        ? "active"
        : "ended";

  const plan = collectionPlan({
    payment_method: order.payment_method,
    total: Number(order.total),
    online_payment_status: order.online_payment_status
  });
  const advanceTotal = ((advances.data ?? []) as Array<{ amount: number | string }>).reduce(
    (sum, row) => sum + Math.round(Number(row.amount) * 100),
    0
  );

  const note =
    plan.kind === "blocked"
      ? plan.reason
      : plan.kind === "none"
        ? plan.reason === "prepaid"
          ? "Already paid. Do NOT collect payment."
          : plan.reason === "nothing_due"
            ? "Nothing to collect."
            : "Confirm payment with the restaurant before handing over."
        : null;

  const tendered =
    assignment.tendered_amount === null ? null : Number(assignment.tendered_amount);
  const stage = stageFor({ trackingState, assignment, status: order.status });

  return {
    trackingState,
    stage,
    orderRef: orderReference(assignment.order_id),
    restaurantName: restaurant?.name ?? "",
    deliveryArea: order.delivery_area,
    address: order.delivery_address,
    landmark: order.delivery_landmark,
    customerName: order.customer_name,
    customerPhone: order.customer_phone?.replace(/\D/g, "") || null,
    navigateUrl: safeMapsUrl(order),
    currency: {
      code: String(restaurant?.currency_code ?? "AED"),
      locale: String(restaurant?.locale ?? "en-AE")
    },
    collection: {
      kind: plan.kind,
      due: plan.due,
      dueLabel: money(plan.due),
      note
    },
    changeAdvanceLabel: advanceTotal > 0 ? money(advanceTotal / 100) : null,
    result:
      stage === "delivered" || stage === "failed"
        ? {
            collectedLabel:
              assignment.collected_method === "Cash on Delivery"
                ? `Cash ${money(plan.due)}`
                : assignment.collected_method === "Card on Delivery"
                  ? `Card ${money(plan.due)}`
                  : null,
            changeLabel:
              assignment.collected_method === "Cash on Delivery" &&
              tendered !== null &&
              tendered > plan.due
                ? money(Math.round((tendered - plan.due) * 100) / 100)
                : null,
            failureReason: assignment.failure_reason
          }
        : null
  };
}

export type RiderActionOutcome =
  | { status: "ok"; state: string; changeDue: number }
  | { status: "not_found" }
  | { status: "rejected"; message: string };

/** Runs a rider's picked up / delivered / could-not-deliver tap. */
export async function runRiderAction(request: RiderActionRequest): Promise<RiderActionOutcome> {
  if (!RIDER_TOKEN_PATTERN.test(request.token)) {
    return { status: "not_found" };
  }

  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error("unavailable");
  }

  const { data, error } = await admin
    .from("order_rider_assignments")
    .select("id,restaurant_id")
    .eq("tracking_token_hash", hashRiderToken(request.token))
    .maybeSingle();

  if (error) {
    throw new Error("unavailable");
  }

  if (!data) {
    return { status: "not_found" };
  }

  const assignment = data as { id: string; restaurant_id: string };
  const rpc = await admin.rpc("rider_delivery_action", {
    requested_action: request.action,
    requested_method: request.method,
    requested_reason: request.reason,
    requested_tendered_amount: request.tenderedAmount,
    target_assignment_id: assignment.id,
    target_restaurant_id: assignment.restaurant_id
  });

  if (rpc.error) {
    // P0001 = a business rule the RPC raised on purpose; anything else is infrastructure.
    if (rpc.error.code === "P0001") {
      return { status: "rejected", message: rpc.error.message };
    }

    throw new Error("unavailable");
  }

  const result = (rpc.data ?? {}) as { state?: string; changed?: boolean; change_due?: number };

  if (result.changed) {
    scheduleOrderNotifications(assignment.restaurant_id);
  }

  return { status: "ok", state: result.state ?? "ended", changeDue: Number(result.change_due ?? 0) };
}
