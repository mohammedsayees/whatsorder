"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { getLiveRidersAction } from "@/app/admin/riders/live-actions";
import { formatSeenAgo, mapsLink, riderFreshness, type LiveFleet } from "@/lib/rider-live";
import { formatDistance } from "@/lib/rider-location";

const LiveRiderMap = dynamic(() => import("@/components/admin/LiveRiderMap"), {
  loading: () => <div className="h-80 animate-pulse rounded-lg bg-stone-100 sm:h-[26rem]" />,
  ssr: false
});

const POLL_MS = 15_000;

/** Riders on the road right now: map first, plain list underneath. */
export function RiderLiveBoard({ initial }: { initial: LiveFleet }) {
  const [fleet, setFleet] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    setRefreshing(true);

    try {
      const next = await getLiveRidersAction();

      if (next) {
        setFleet(next);
        setFailed(false);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setNow(Date.now());
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void refresh();
      }
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) {
        void refresh();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const tracked = fleet.riders.filter((rider) => rider.position).length;

  return (
    <section aria-label="Live riders" className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black">Live riders</h2>
          <p className="text-xs text-stone-500">
            {fleet.riders.length === 0
              ? "No deliveries with a rider right now."
              : `${fleet.riders.length} delivery${fleet.riders.length === 1 ? "" : "ies"} in progress · ${tracked} sharing location`}
          </p>
        </div>
        <button
          className="focus-ring inline-flex items-center gap-2 rounded-lg border border-stone-300 px-3 py-2 text-sm font-black disabled:opacity-60"
          disabled={refreshing}
          onClick={() => void refresh()}
          type="button"
        >
          <RefreshCw className={refreshing ? "animate-spin" : ""} size={15} />
          Refresh
        </button>
      </div>

      {failed ? (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-900" role="status">
          Could not refresh. Showing the last positions; trying again shortly.
        </p>
      ) : null}

      {fleet.riders.length > 0 || fleet.restaurant ? (
        <div className="mt-4">
          <LiveRiderMap fleet={fleet} />
          <p className="mt-2 text-xs text-stone-500">
            Green = sharing now · grey = last seen · ⌂ = delivery address · ★ = restaurant. Riders only appear while their
            delivery is open.
          </p>
        </div>
      ) : null}

      {fleet.riders.length > 0 ? (
        <ul className="mt-4 divide-y divide-stone-100">
          {fleet.riders.map((rider) => {
            const freshness = riderFreshness(rider.position, now);

            return (
              <li className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm" key={rider.assignmentId}>
                <div className="min-w-0">
                  <p className="font-black">
                    {rider.riderName} · #{rider.orderRef}
                  </p>
                  <p className="text-xs text-stone-600">
                    {rider.customerName}
                    {rider.area ? ` · ${rider.area}` : ""}
                  </p>
                  <p className="mt-1 text-xs font-bold text-stone-700">
                    {rider.pickedUp ? "On the way" : "Not picked up yet"}
                    {rider.distanceKm !== null ? ` · ${formatDistance(rider.distanceKm)} from customer` : ""}
                  </p>
                </div>
                <div className="text-right text-xs">
                  <p
                    className={`font-black ${freshness === "live" ? "text-leaf" : freshness === "stale" ? "text-amber-800" : "text-stone-500"}`}
                  >
                    {rider.position
                      ? freshness === "live"
                        ? `Live · ${formatSeenAgo(rider.position.updatedAt, now)}`
                        : `Last seen ${formatSeenAgo(rider.position.updatedAt, now)}`
                      : "Location not shared"}
                  </p>
                  {rider.position ? (
                    <a
                      className="focus-ring mt-1 inline-flex items-center gap-1 rounded font-bold text-blue-700 underline"
                      href={mapsLink(rider.position.latitude, rider.position.longitude)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open in Maps <ExternalLink size={12} />
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
