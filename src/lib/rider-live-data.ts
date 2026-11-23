import "server-only";

import { haversineKm } from "@/lib/geo";
import { orderReference } from "@/lib/order-notifications";
import { RIDER_SHARING_STATUSES } from "@/lib/rider-location";
import { sortLiveRiders, type LiveFleet, type LiveRider } from "@/lib/rider-live";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { OrderStatus } from "@/lib/types";

// Live board for the restaurant: every delivery that has a rider and is still
// in progress, with the rider's last saved position. Strictly scoped by the
// session's restaurant_id; positions are the same single row per assignment the
// customer view uses, and are deleted when the order closes.

type OrderRow = {
  id: string;
  status: OrderStatus;
  customer_name: string;
  delivery_area: string | null;
  delivery_latitude: number | string | null;
  delivery_longitude: number | string | null;
};

type AssignmentRow = {
  id: string;
  order_id: string;
  rider_id: string;
  picked_up_at: string | null;
  outcome: "delivered" | "failed" | null;
};

const num = (value: number | string | null | undefined) => {
  const parsed = value === null || value === undefined ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function getLiveRiderFleet(restaurantId: string): Promise<LiveFleet> {
  const admin = getSupabaseAdmin();
  const generatedAt = new Date().toISOString();

  if (!admin) {
    return { generatedAt, restaurant: null, riders: [] };
  }

  const [ordersResult, restaurantResult] = await Promise.all([
    admin
      .from("orders")
      .select("id,status,customer_name,delivery_area,delivery_latitude,delivery_longitude")
      .eq("restaurant_id", restaurantId)
      .eq("fulfilment_type", "delivery")
      .in("status", [...RIDER_SHARING_STATUSES])
      .limit(200),
    admin.from("restaurants").select("name,latitude,longitude").eq("id", restaurantId).maybeSingle()
  ]);

  if (ordersResult.error || restaurantResult.error) {
    throw new Error("The live rider board could not be loaded.");
  }

  const orders = (ordersResult.data ?? []) as OrderRow[];
  const restaurantRow = restaurantResult.data as
    | { name: string; latitude: number | string | null; longitude: number | string | null }
    | null;
  const restaurantLat = num(restaurantRow?.latitude);
  const restaurantLng = num(restaurantRow?.longitude);
  const restaurant =
    restaurantRow && restaurantLat !== null && restaurantLng !== null
      ? { name: restaurantRow.name, latitude: restaurantLat, longitude: restaurantLng }
      : null;

  if (orders.length === 0) {
    return { generatedAt, restaurant, riders: [] };
  }

  const orderIds = orders.map((order) => order.id);
  const assignmentsResult = await admin
    .from("order_rider_assignments")
    .select("id,order_id,rider_id,picked_up_at,outcome")
    .eq("restaurant_id", restaurantId)
    .in("order_id", orderIds)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (assignmentsResult.error) {
    throw new Error("The live rider board could not be loaded.");
  }

  // Newest assignment per order is the current one.
  const current = new Map<string, AssignmentRow>();

  for (const row of (assignmentsResult.data ?? []) as AssignmentRow[]) {
    if (!current.has(row.order_id)) {
      current.set(row.order_id, row);
    }
  }

  const assignments = [...current.values()];

  if (assignments.length === 0) {
    return { generatedAt, restaurant, riders: [] };
  }

  const [ridersResult, locationsResult] = await Promise.all([
    admin
      .from("delivery_riders")
      .select("id,name")
      .eq("restaurant_id", restaurantId)
      .in("id", [...new Set(assignments.map((assignment) => assignment.rider_id))]),
    admin
      .from("rider_live_locations")
      .select("assignment_id,latitude,longitude,updated_at")
      .eq("restaurant_id", restaurantId)
      .in("assignment_id", assignments.map((assignment) => assignment.id))
  ]);

  if (ridersResult.error || locationsResult.error) {
    throw new Error("The live rider board could not be loaded.");
  }

  const riderNames = new Map(
    ((ridersResult.data ?? []) as Array<{ id: string; name: string }>).map((rider) => [rider.id, rider.name])
  );
  const locations = new Map(
    (
      (locationsResult.data ?? []) as Array<{
        assignment_id: string;
        latitude: number;
        longitude: number;
        updated_at: string;
      }>
    ).map((row) => [row.assignment_id, row])
  );
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const riders: LiveRider[] = [];

  for (const assignment of assignments) {
    const order = ordersById.get(assignment.order_id);

    if (!order || assignment.outcome === "delivered") {
      continue;
    }

    const location = locations.get(assignment.id);
    const destLat = num(order.delivery_latitude);
    const destLng = num(order.delivery_longitude);
    const position = location
      ? { latitude: Number(location.latitude), longitude: Number(location.longitude), updatedAt: location.updated_at }
      : null;
    const destination = destLat !== null && destLng !== null ? { latitude: destLat, longitude: destLng } : null;

    riders.push({
      assignmentId: assignment.id,
      riderName: riderNames.get(assignment.rider_id) ?? "Rider",
      orderRef: orderReference(order.id),
      status: order.status,
      customerName: order.customer_name,
      area: order.delivery_area,
      pickedUp: order.status === "Out for Delivery",
      position,
      destination,
      distanceKm:
        position && destination
          ? haversineKm(position.latitude, position.longitude, destination.latitude, destination.longitude)
          : null
    });
  }

  return { generatedAt, restaurant, riders: sortLiveRiders(riders) };
}
