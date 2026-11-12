import { describe, expect, it } from "vitest";

import {
  parseGoLiveSettings,
  parseMapLocation,
  simpleOpeningHours
} from "@/lib/go-live-settings";

function form(entries: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      data.append(key, item);
    }
  }
  return data;
}

const base = {
  delivery_enabled: "on",
  pickup_enabled: "on",
  delivery_fee: "5",
  minimum_order_amount: "20",
  hours_mode: "set",
  open_time: "07:00",
  close_time: "01:00"
};

describe("parseMapLocation", () => {
  it("reads plain coordinates and common Google Maps URLs", () => {
    expect(parseMapLocation("25.4052, 55.5136")).toEqual({ latitude: 25.4052, longitude: 55.5136 });
    expect(
      parseMapLocation("https://www.google.com/maps/place/Chai/@25.4052123,55.5136456,17z/data=x")
    ).toEqual({ latitude: 25.405212, longitude: 55.513646 });
    expect(
      parseMapLocation("https://www.google.com/maps/place/x/data=!3m1!4b1!3d25.41!4d55.52")
    ).toEqual({ latitude: 25.41, longitude: 55.52 });
    expect(parseMapLocation("https://maps.google.com/?q=25.41%2C55.52")).toEqual({
      latitude: 25.41,
      longitude: 55.52
    });
  });

  it("rejects short links, nonsense and out-of-range values", () => {
    expect(parseMapLocation("https://maps.app.goo.gl/abc123")).toBeNull();
    expect(parseMapLocation("Ajman")).toBeNull();
    expect(parseMapLocation("95, 55")).toBeNull();
    expect(parseMapLocation("0, 0")).toBeNull();
  });
});

describe("simpleOpeningHours", () => {
  it("applies one schedule to every day and marks closed days", () => {
    const hours = simpleOpeningHours("07:00", "01:00", ["friday"]);
    expect(hours.monday).toEqual({ closed: false, open: "07:00", close: "01:00" });
    expect(hours.friday.closed).toBe(true);
  });
});

describe("parseGoLiveSettings", () => {
  it("builds the restaurant update from a complete form", () => {
    const result = parseGoLiveSettings(
      form({
        ...base,
        delivery_radius_km: "5",
        location_text: "25.4052, 55.5136",
        address: " Al Nuaimiya, Ajman ",
        closed_days: ["friday"]
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings).toMatchObject({
      delivery_enabled: true,
      pickup_enabled: true,
      car_pickup_enabled: false,
      dine_in_enabled: false,
      delivery_fee: 5,
      minimum_order_amount: 20,
      delivery_radius_km: 5,
      latitude: 25.4052,
      longitude: 55.5136,
      address: "Al Nuaimiya, Ajman",
      opening_hours_enabled: true
    });
    expect(result.settings.opening_hours.friday.closed).toBe(true);
    expect(result.settings.opening_hours.monday.open).toBe("07:00");
  });

  it("prefers the location button's coordinates over pasted text", () => {
    const result = parseGoLiveSettings(
      form({ ...base, latitude: "25.1", longitude: "55.2", location_text: "garbage" })
    );
    expect(result.ok && result.settings.latitude).toBe(25.1);
  });

  it("requires at least one order type", () => {
    const { delivery_enabled: _d, pickup_enabled: _p, ...rest } = base;
    void _d;
    void _p;
    expect(parseGoLiveSettings(form(rest))).toMatchObject({ ok: false });
  });

  it("rejects bad money, radius without a location and unreadable locations", () => {
    expect(parseGoLiveSettings(form({ ...base, delivery_fee: "-1" }))).toMatchObject({ ok: false });
    expect(parseGoLiveSettings(form({ ...base, delivery_radius_km: "5" }))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/location/)
    });
    expect(parseGoLiveSettings(form({ ...base, location_text: "Ajman" }))).toMatchObject({
      ok: false
    });
  });

  it("validates hours unless the café is always open", () => {
    expect(parseGoLiveSettings(form({ ...base, close_time: "07:00" }))).toMatchObject({ ok: false });
    expect(
      parseGoLiveSettings(
        form({
          ...base,
          closed_days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        })
      )
    ).toMatchObject({ ok: false });
    const always = parseGoLiveSettings(form({ ...base, hours_mode: "always", open_time: "" }));
    expect(always.ok && always.settings.opening_hours_enabled).toBe(false);
  });

  it("drops delivery-only terms when delivery is off", () => {
    const result = parseGoLiveSettings(
      form({ pickup_enabled: "on", delivery_fee: "9", delivery_radius_km: "5", hours_mode: "always" })
    );
    expect(result.ok && result.settings).toMatchObject({
      delivery_enabled: false,
      delivery_fee: 0,
      delivery_radius_km: null
    });
  });
});
