import type { OrderStatus } from "@/lib/types";

// What the restaurant's live rider board shows. Pure helpers shared by the
// server data loader and the client map.

/** A position older than this is shown greyed out as "last seen". */
export const RIDER_STALE_AFTER_MS = 2 * 60 * 1000;

export type LiveRider = {
  assignmentId: string;
  riderName: string;
  orderRef: string;
  status: OrderStatus;
  customerName: string;
  area: string | null;
  pickedUp: boolean;
  position: { latitude: number; longitude: number; updatedAt: string } | null;
  destination: { latitude: number; longitude: number } | null;
  distanceKm: number | null;
};

export type LiveFleet = {
  generatedAt: string;
  restaurant: { name: string; latitude: number; longitude: number } | null;
  riders: LiveRider[];
};

export type RiderFreshness = "live" | "stale" | "none";

export function riderFreshness(
  position: { updatedAt: string } | null,
  now = Date.now()
): RiderFreshness {
  if (!position) {
    return "none";
  }

  const updated = Date.parse(position.updatedAt);

  if (!Number.isFinite(updated)) {
    return "none";
  }

  return now - updated > RIDER_STALE_AFTER_MS ? "stale" : "live";
}

/** "just now", "45 s ago", "3 min ago", "2 h ago". */
export function formatSeenAgo(updatedAt: string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - Date.parse(updatedAt)) / 1000));

  if (!Number.isFinite(seconds)) return "unknown";
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

/** Deep link that opens a coordinate in the maps app. */
export function mapsLink(latitude: number, longitude: number) {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

/** Riders worth looking at first: moving ones, then by most recent update. */
export function sortLiveRiders(riders: readonly LiveRider[]) {
  const rank = (rider: LiveRider) => (rider.pickedUp ? 0 : 1);

  return [...riders].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      Date.parse(b.position?.updatedAt ?? "1970-01-01") - Date.parse(a.position?.updatedAt ?? "1970-01-01") ||
      a.riderName.localeCompare(b.riderName)
  );
}
