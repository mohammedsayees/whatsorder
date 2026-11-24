import { describe, expect, it } from "vitest";
import {
  RIDER_STALE_AFTER_MS,
  formatSeenAgo,
  mapsLink,
  riderFreshness,
  sortLiveRiders,
  type LiveRider
} from "@/lib/rider-live";

const now = Date.parse("2026-12-15T10:00:00.000Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

function rider(overrides: Partial<LiveRider>): LiveRider {
  return {
    assignmentId: "a",
    riderName: "Ahmed",
    orderRef: "AAAA1111",
    status: "Out for Delivery",
    customerName: "Sara",
    area: null,
    pickedUp: true,
    position: null,
    destination: null,
    distanceKm: null,
    ...overrides
  };
}

describe("riderFreshness", () => {
  it("is live for a recent position, stale after two minutes, none without one", () => {
    expect(riderFreshness({ updatedAt: ago(30_000) }, now)).toBe("live");
    expect(riderFreshness({ updatedAt: ago(RIDER_STALE_AFTER_MS + 1000) }, now)).toBe("stale");
    expect(riderFreshness(null, now)).toBe("none");
    expect(riderFreshness({ updatedAt: "garbage" }, now)).toBe("none");
  });
});

describe("formatSeenAgo", () => {
  it("reads naturally", () => {
    expect(formatSeenAgo(ago(3000), now)).toBe("just now");
    expect(formatSeenAgo(ago(45_000), now)).toBe("45 s ago");
    expect(formatSeenAgo(ago(180_000), now)).toBe("3 min ago");
    expect(formatSeenAgo(ago(2 * 3600_000), now)).toBe("2 h ago");
  });
});

describe("mapsLink", () => {
  it("opens the coordinate", () => {
    expect(mapsLink(25.29, 55.37)).toBe("https://www.google.com/maps?q=25.29,55.37");
  });
});

describe("sortLiveRiders", () => {
  it("puts riders already on the road first, then the freshest", () => {
    const sorted = sortLiveRiders([
      rider({ assignmentId: "waiting", pickedUp: false, riderName: "Zed" }),
      rider({ assignmentId: "old", position: { latitude: 1, longitude: 1, updatedAt: ago(60_000) } }),
      rider({ assignmentId: "fresh", position: { latitude: 1, longitude: 1, updatedAt: ago(5_000) } })
    ]);

    expect(sorted.map((item) => item.assignmentId)).toEqual(["fresh", "old", "waiting"]);
  });
});
