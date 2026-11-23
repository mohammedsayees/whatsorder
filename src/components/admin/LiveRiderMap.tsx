"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { riderFreshness, type LiveFleet } from "@/lib/rider-live";

// Loaded only on the admin Riders page (next/dynamic, no SSR), so Leaflet and
// its CSS never reach the customer bundle. Markers are plain DOM built with
// textContent, so rider/customer names can never inject markup.

const LIVE = "#15803d";
const STALE = "#78716c";
const DESTINATION = "#1d4ed8";
const SHOP = "#b45309";

function dot(label: string, color: string, shape: "circle" | "square" | "star") {
  const element = document.createElement("div");
  element.textContent = label;
  element.style.cssText = [
    "display:grid",
    "place-items:center",
    "width:30px",
    "height:30px",
    `background:${color}`,
    "color:#fff",
    "font:900 13px system-ui,sans-serif",
    "border:2px solid #fff",
    "box-shadow:0 1px 4px rgba(0,0,0,.4)",
    shape === "circle" ? "border-radius:999px" : shape === "square" ? "border-radius:6px" : "border-radius:8px;transform:rotate(45deg)"
  ].join(";");
  return L.divIcon({ className: "", html: element, iconSize: [30, 30], iconAnchor: [15, 15] });
}

export default function LiveRiderMap({ fleet }: { fleet: LiveFleet }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const fittedRef = useRef<string>("");

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView(
      [25.2048, 55.2708],
      11
    );

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;

    if (!map || !layer) {
      return;
    }

    layer.clearLayers();
    const points: L.LatLngExpression[] = [];

    if (fleet.restaurant) {
      const point: L.LatLngExpression = [fleet.restaurant.latitude, fleet.restaurant.longitude];
      L.marker(point, { icon: dot("★", SHOP, "square"), title: fleet.restaurant.name }).addTo(layer);
      points.push(point);
    }

    for (const rider of fleet.riders) {
      const freshness = riderFreshness(rider.position);

      if (rider.destination) {
        const destination: L.LatLngExpression = [rider.destination.latitude, rider.destination.longitude];
        L.marker(destination, {
          icon: dot("⌂", DESTINATION, "square"),
          title: `#${rider.orderRef} · ${rider.customerName}`
        }).addTo(layer);
        points.push(destination);

        if (rider.position) {
          L.polyline([[rider.position.latitude, rider.position.longitude], destination], {
            color: freshness === "live" ? LIVE : STALE,
            dashArray: "6 8",
            opacity: 0.7,
            weight: 3
          }).addTo(layer);
        }
      }

      if (rider.position) {
        const point: L.LatLngExpression = [rider.position.latitude, rider.position.longitude];
        L.marker(point, {
          icon: dot(rider.riderName.trim().charAt(0).toUpperCase() || "R", freshness === "live" ? LIVE : STALE, "circle"),
          title: `${rider.riderName} · #${rider.orderRef}`
        }).addTo(layer);
        points.push(point);
      }
    }

    // Re-frame only when the set of riders changes, so a pan or zoom sticks.
    const signature = fleet.riders.map((rider) => rider.assignmentId).sort().join("|");

    if (signature !== fittedRef.current && points.length > 0) {
      fittedRef.current = signature;
      map.fitBounds(L.latLngBounds(points), { maxZoom: 15, padding: [40, 40] });
    }
  }, [fleet]);

  return (
    <div
      aria-label="Live map of riders and delivery addresses"
      className="h-80 w-full overflow-hidden rounded-lg border border-stone-200 bg-stone-100 sm:h-[26rem]"
      ref={containerRef}
      role="region"
    />
  );
}
