// "Go live" settings captured while claiming a demo store: how customers
// order, delivery terms, location and opening hours. Pure helpers shared by
// the claim form (live location parsing) and the claim action (validation),
// plus their tests. No Next.js or Node-builtin imports.

import {
  defaultOpeningHours,
  weekDays,
  type OpeningHours,
  type WeekDay
} from "@/lib/opening-hours";

export const MAX_MONEY_AMOUNT = 10_000;
export const MAX_DELIVERY_RADIUS_KM = 100;

export type GoLiveSettings = {
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  car_pickup_enabled: boolean;
  dine_in_enabled: boolean;
  delivery_fee: number;
  minimum_order_amount: number;
  delivery_radius_km: number | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  opening_hours_enabled: boolean;
  opening_hours: OpeningHours;
};

export type GoLiveParseResult =
  | { ok: true; settings: GoLiveSettings }
  | { ok: false; error: string };

export type MapLocation = { latitude: number; longitude: number };

function round6(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function validLocation(latitude: number, longitude: number): MapLocation | null {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    (latitude === 0 && longitude === 0)
  ) {
    return null;
  }
  return { latitude: round6(latitude), longitude: round6(longitude) };
}

// Accepts plain "lat, lng" or a full Google Maps URL ("@lat,lng", "!3dlat!4dlng",
// "?q=lat,lng"). Short share links (maps.app.goo.gl) don't contain coordinates,
// so they return null and the form asks for the location button instead.
export function parseMapLocation(raw: string): MapLocation | null {
  const text = String(raw ?? "").trim();
  if (!text) {
    return null;
  }

  const decoded = (() => {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  })();

  const patterns = [
    /!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/,
    /@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /[?&](?:q|ll|query|destination|center)=(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/i,
    /^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/
  ];

  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (match) {
      return validLocation(Number(match[1]), Number(match[2]));
    }
  }

  return null;
}

function validTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function simpleOpeningHours(
  open: string,
  close: string,
  closedDays: WeekDay[]
): OpeningHours {
  const closed = new Set(closedDays);
  return Object.fromEntries(
    weekDays.map((day) => [
      day,
      {
        closed: closed.has(day),
        open: validTime(open) ? open : defaultOpeningHours[day].open,
        close: validTime(close) ? close : defaultOpeningHours[day].close
      }
    ])
  ) as OpeningHours;
}

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function moneyValue(raw: string): number | null {
  if (!raw) {
    return 0;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= MAX_MONEY_AMOUNT
    ? Math.round(value * 100) / 100
    : null;
}

export function parseGoLiveSettings(formData: FormData): GoLiveParseResult {
  const delivery = formData.get("delivery_enabled") === "on";
  const pickup = formData.get("pickup_enabled") === "on";
  const carPickup = formData.get("car_pickup_enabled") === "on";
  const dineIn = formData.get("dine_in_enabled") === "on";

  if (!delivery && !pickup && !carPickup && !dineIn) {
    return { ok: false, error: "Choose at least one way for customers to get their order." };
  }

  const deliveryFee = moneyValue(text(formData, "delivery_fee"));
  if (deliveryFee === null) {
    return { ok: false, error: "Enter a delivery fee of 0 or more." };
  }
  const minimumOrder = moneyValue(text(formData, "minimum_order_amount"));
  if (minimumOrder === null) {
    return { ok: false, error: "Enter a minimum order of 0 or more." };
  }

  let location: MapLocation | null = null;
  const latitudeRaw = text(formData, "latitude");
  const longitudeRaw = text(formData, "longitude");
  if (latitudeRaw && longitudeRaw) {
    location = validLocation(Number(latitudeRaw), Number(longitudeRaw));
  }
  const locationText = text(formData, "location_text");
  if (!location && locationText) {
    location = parseMapLocation(locationText);
    if (!location) {
      return {
        ok: false,
        error:
          "We couldn't read that location. Tap “Use my current location”, or paste coordinates like 25.4052, 55.5136."
      };
    }
  }

  let radius: number | null = null;
  const radiusRaw = text(formData, "delivery_radius_km");
  if (delivery && radiusRaw) {
    const value = Number(radiusRaw);
    if (!Number.isFinite(value) || value < 0 || value > MAX_DELIVERY_RADIUS_KM) {
      return { ok: false, error: `Delivery radius must be between 0 and ${MAX_DELIVERY_RADIUS_KM} km.` };
    }
    radius = value > 0 ? Math.round(value * 10) / 10 : null;
  }
  if (radius !== null && !location) {
    return {
      ok: false,
      error: "Add your café's location to use a delivery radius, or leave the radius empty."
    };
  }

  const hoursEnabled = text(formData, "hours_mode") !== "always";
  const open = text(formData, "open_time");
  const close = text(formData, "close_time");
  const closedDays = formData
    .getAll("closed_days")
    .map(String)
    .filter((day): day is WeekDay => (weekDays as readonly string[]).includes(day));

  if (hoursEnabled) {
    if (!validTime(open) || !validTime(close)) {
      return { ok: false, error: "Enter your opening and closing times." };
    }
    if (open === close) {
      return {
        ok: false,
        error: "Opening and closing times can't be the same. Choose “Always open” for 24 hours."
      };
    }
    if (new Set(closedDays).size === weekDays.length) {
      return { ok: false, error: "Leave at least one day open." };
    }
  }

  return {
    ok: true,
    settings: {
      delivery_enabled: delivery,
      pickup_enabled: pickup,
      car_pickup_enabled: carPickup,
      dine_in_enabled: dineIn,
      delivery_fee: delivery ? deliveryFee : 0,
      minimum_order_amount: minimumOrder,
      delivery_radius_km: delivery ? radius : null,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      address: text(formData, "address").slice(0, 300) || null,
      opening_hours_enabled: hoursEnabled,
      opening_hours: simpleOpeningHours(open, close, hoursEnabled ? closedDays : [])
    }
  };
}
