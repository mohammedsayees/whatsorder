import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { haversineKm } from "@/lib/geo";
import { orderReference } from "@/lib/order-notifications";
import {
  RIDER_LOCATION_FRESH_MS,
  RIDER_SHARING_STATUSES,
  isRiderVisibleToCustomer,
  riderFirstName,
  type CustomerRiderView,
  type RiderFix
} from "@/lib/rider-location";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeCustomerPhone } from "@/lib/whatsapp";
import type { FulfilmentType, OrderStatus } from "@/lib/types";

// Rider live location. The tracking link's secret is only ever stored as a
// SHA-256 hash; every read/write is scoped by the assignment's own
// restaurant_id and order_id, never by anything the client sends.

export const RIDER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{30,64}$/;
const TOKEN = RIDER_TOKEN_PATTERN;
/** Ignore positions sent faster than this per assignment. */
const MIN_SAVE_GAP_MS = 5000;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** The hash stored for a tracking link's secret. */
export function hashRiderToken(token: string) {
  return sha256(token);
}

function publicAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  if (configured) {
    return configured;
  }

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return vercelUrl ? `https://${vercelUrl}` : "http://localhost:3000";
}

/** A fresh tracking secret for a new assignment; store only `hash`. */
export function newRiderTrackingToken() {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: sha256(token), url: `${publicAppUrl()}/rider/${token}` };
}

type Assignment = { id: string; restaurant_id: string; order_id: string; rider_id: string };
type OrderState = {
  status: OrderStatus;
  fulfilment_type: FulfilmentType | null;
  delivery_area: string | null;
};

export type TrackingState = "active" | "ended" | "replaced";

async function resolveToken(token: string) {
  if (!TOKEN.test(token)) {
    return null;
  }

  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error("unavailable");
  }

  const { data: assignment, error } = await admin
    .from("order_rider_assignments")
    .select("id,restaurant_id,order_id,rider_id")
    .eq("tracking_token_hash", sha256(token))
    .maybeSingle();

  if (error) {
    throw new Error("unavailable");
  }

  if (!assignment) {
    return null;
  }

  const current = assignment as Assignment;
  const [latestResult, orderResult, restaurantResult] = await Promise.all([
    admin
      .from("order_rider_assignments")
      .select("id")
      .eq("restaurant_id", current.restaurant_id)
      .eq("order_id", current.order_id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("orders")
      .select("status,fulfilment_type,delivery_area")
      .eq("restaurant_id", current.restaurant_id)
      .eq("id", current.order_id)
      .maybeSingle(),
    admin.from("restaurants").select("name").eq("id", current.restaurant_id).maybeSingle()
  ]);

  if (latestResult.error || orderResult.error) {
    throw new Error("unavailable");
  }

  const order = orderResult.data as OrderState | null;

  if (!order) {
    return null;
  }

  const state: TrackingState =
    latestResult.data?.id !== current.id
      ? "replaced"
      : RIDER_SHARING_STATUSES.includes(order.status) && order.fulfilment_type === "delivery"
        ? "active"
        : "ended";

  return {
    admin,
    assignment: current,
    order,
    restaurantName: (restaurantResult.data as { name?: string } | null)?.name ?? "",
    state
  };
}

/** What the rider's page shows. Null for an unknown link. */
export async function getRiderTrackingContext(token: string) {
  const resolved = await resolveToken(token);

  if (!resolved) {
    return null;
  }

  return {
    state: resolved.state,
    orderRef: orderReference(resolved.assignment.order_id),
    restaurantName: resolved.restaurantName,
    deliveryArea: resolved.order.delivery_area
  };
}

/** Saves the rider's latest position while their delivery is active. */
export async function recordRiderLocation(
  token: string,
  fix: RiderFix
): Promise<TrackingState | "not_found"> {
  const resolved = await resolveToken(token);

  if (!resolved) {
    return "not_found";
  }

  const { admin, assignment, state } = resolved;

  if (state !== "active") {
    // The delivery is over (or reassigned): forget where this rider was.
    await admin
      .from("rider_live_locations")
      .delete()
      .eq("assignment_id", assignment.id)
      .eq("restaurant_id", assignment.restaurant_id);
    return state;
  }

  const { data: existing } = await admin
    .from("rider_live_locations")
    .select("updated_at")
    .eq("assignment_id", assignment.id)
    .eq("restaurant_id", assignment.restaurant_id)
    .maybeSingle();

  const last = existing ? Date.parse((existing as { updated_at: string }).updated_at) : 0;

  if (Date.now() - last < MIN_SAVE_GAP_MS) {
    return "active";
  }

  const { error } = await admin.from("rider_live_locations").upsert(
    {
      assignment_id: assignment.id,
      restaurant_id: assignment.restaurant_id,
      order_id: assignment.order_id,
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracy_m: fix.accuracy,
      updated_at: new Date().toISOString()
    },
    { onConflict: "assignment_id" }
  );

  if (error) {
    throw new Error("unavailable");
  }

  return "active";
}

/**
 * The rider card for the customer's order page: only for delivery orders
 * that are Out for Delivery, only the current rider, and only a recent
 * position. Once the order is closed, stored positions are deleted.
 */
export async function getCustomerRiderView(
  restaurantId: string,
  orderId: string,
  order: { status: OrderStatus; fulfilment_type: FulfilmentType | null }
): Promise<CustomerRiderView | null> {
  const admin = getSupabaseAdmin();

  if (!admin || order.fulfilment_type !== "delivery") {
    return null;
  }

  try {
    if (!isRiderVisibleToCustomer(order.status)) {
      if (order.status === "Completed" || order.status === "Cancelled") {
        await admin
          .from("rider_live_locations")
          .delete()
          .eq("restaurant_id", restaurantId)
          .eq("order_id", orderId);
      }
      return null;
    }

    const { data: latest, error } = await admin
      .from("order_rider_assignments")
      .select("id,rider_id")
      .eq("restaurant_id", restaurantId)
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !latest) {
      return null;
    }

    const assignment = latest as { id: string; rider_id: string };
    const [riderResult, locationResult, orderResult, restaurantResult] = await Promise.all([
      admin
        .from("delivery_riders")
        .select("name,phone")
        .eq("restaurant_id", restaurantId)
        .eq("id", assignment.rider_id)
        .maybeSingle(),
      admin
        .from("rider_live_locations")
        .select("latitude,longitude,updated_at")
        .eq("restaurant_id", restaurantId)
        .eq("assignment_id", assignment.id)
        .maybeSingle(),
      admin
        .from("orders")
        .select("delivery_latitude,delivery_longitude")
        .eq("restaurant_id", restaurantId)
        .eq("id", orderId)
        .maybeSingle(),
      admin.from("restaurants").select("phone_country_code").eq("id", restaurantId).maybeSingle()
    ]);

    const rider = riderResult.data as { name: string; phone: string } | null;

    if (!rider) {
      return null;
    }

    const countryCode =
      (restaurantResult.data as { phone_country_code?: string } | null)?.phone_country_code ?? "971";
    const position = locationResult.data as {
      latitude: number;
      longitude: number;
      updated_at: string;
    } | null;
    const fresh =
      position && Date.now() - Date.parse(position.updated_at) <= RIDER_LOCATION_FRESH_MS;
    const destination = orderResult.data as {
      delivery_latitude: number | null;
      delivery_longitude: number | null;
    } | null;
    const hasDestination =
      destination?.delivery_latitude != null && destination.delivery_longitude != null;

    return {
      name: riderFirstName(rider.name),
      phone: rider.phone ? normalizeCustomerPhone(rider.phone, countryCode) : null,
      location:
        position && fresh
          ? {
              distanceKm: hasDestination
                ? haversineKm(
                    Number(position.latitude),
                    Number(position.longitude),
                    Number(destination!.delivery_latitude),
                    Number(destination!.delivery_longitude)
                  )
                : null,
              updatedAt: position.updated_at,
              mapsUrl: `https://www.google.com/maps?q=${position.latitude},${position.longitude}`
            }
          : null
    };
  } catch {
    return null;
  }
}
