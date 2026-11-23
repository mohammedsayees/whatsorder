"use server";

import { getLiveRiderFleet } from "@/lib/rider-live-data";
import type { LiveFleet } from "@/lib/rider-live";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

/** Polled by the live rider board. Always scoped to the signed-in restaurant. */
export async function getLiveRidersAction(): Promise<LiveFleet | null> {
  const session = await requireRestaurantAdmin();

  try {
    return await getLiveRiderFleet(session.restaurantId);
  } catch {
    return null;
  }
}
