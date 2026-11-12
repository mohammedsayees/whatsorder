"use client";

import { useActionState, useState } from "react";
import { Loader2, LocateFixed } from "lucide-react";

import { claimDemoRestaurantAction, type ClaimFormState } from "@/app/try/claim/actions";
import { parseMapLocation } from "@/lib/go-live-settings";
import { weekDayLabels, weekDays } from "@/lib/opening-hours";
import { normalizeStoreSlug, storeSlugError } from "@/lib/store-slug";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500";
const labelClass = "block text-sm font-semibold text-emerald-950";
const sectionClass = "rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm";

const initialValues: Record<string, string> = {
  owner_email: "",
  whatsapp_number: "",
  delivery_enabled: "on",
  pickup_enabled: "on",
  car_pickup_enabled: "",
  dine_in_enabled: "",
  delivery_fee: "",
  minimum_order_amount: "",
  delivery_radius_km: "",
  latitude: "",
  longitude: "",
  location_text: "",
  address: "",
  hours_mode: "set",
  open_time: "08:00",
  close_time: "23:00",
  closed_days: ""
};

type LocationStatus =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "set"; accuracy: number | null }
  | { kind: "error"; message: string };

export default function ClaimDemoForm({
  suggestedSlug,
  countryName,
  currencyCode,
  phonePlaceholder,
  origin
}: {
  suggestedSlug: string;
  countryName: string;
  currencyCode: string;
  phonePlaceholder: string;
  origin: string;
}) {
  const [state, formAction, pending] = useActionState<ClaimFormState, FormData>(
    claimDemoRestaurantAction,
    { error: null, values: { ...initialValues, slug: suggestedSlug } }
  );
  const v = state.values;

  const [slug, setSlug] = useState(v.slug ?? "");
  const normalized = normalizeStoreSlug(slug);
  const slugHint = slug ? storeSlugError(normalized) : null;

  const [delivery, setDelivery] = useState(v.delivery_enabled === "on");
  const [hoursMode, setHoursMode] = useState(v.hours_mode === "always" ? "always" : "set");

  const [coords, setCoords] = useState({ latitude: v.latitude ?? "", longitude: v.longitude ?? "" });
  const [locationText, setLocationText] = useState(v.location_text ?? "");
  const [locationStatus, setLocationStatus] = useState<LocationStatus>(
    v.latitude ? { kind: "set", accuracy: null } : { kind: "idle" }
  );
  const pasted = locationText ? parseMapLocation(locationText) : null;
  const closedDays = new Set((v.closed_days ?? "").split(",").filter(Boolean));

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setLocationStatus({ kind: "error", message: "This browser can't share its location. Paste a Maps link instead." });
      return;
    }
    setLocationStatus({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6)
        });
        setLocationText("");
        setLocationStatus({ kind: "set", accuracy: Math.round(position.coords.accuracy) });
      },
      () =>
        setLocationStatus({
          kind: "error",
          message: "Location permission was blocked. Allow it, or paste a Google Maps link below."
        }),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  return (
    <form action={formAction} className="mt-7 space-y-5">
      {/* 1. Store */}
      <section className={sectionClass}>
        <h2 className="text-lg font-bold text-emerald-950">1. Your store</h2>

        <label className={`mt-4 ${labelClass}`} htmlFor="claim-slug">
          Store link
        </label>
        <div className="mt-1.5 flex items-center overflow-hidden rounded-xl border border-slate-200 focus-within:border-emerald-500">
          <span className="shrink-0 bg-slate-50 px-3 py-3 text-sm text-slate-500">/r/</span>
          <input
            id="claim-slug"
            name="slug"
            required
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            onBlur={() => setSlug(normalized)}
            maxLength={60}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 px-3 py-3 outline-none"
          />
        </div>
        <p className={`mt-2 text-xs ${slugHint ? "text-rose-600" : "text-slate-500"}`}>
          {slugHint ?? (
            <>
              Customers will order at{" "}
              <span className="font-semibold text-slate-700">
                {origin}/r/{normalized || "your-cafe"}
              </span>
              . This goes on your QR codes.
            </>
          )}
        </p>

        <label className={`mt-4 ${labelClass}`} htmlFor="claim-whatsapp">
          Restaurant WhatsApp number
        </label>
        <input
          id="claim-whatsapp"
          name="whatsapp_number"
          type="tel"
          required
          autoComplete="tel"
          maxLength={20}
          defaultValue={v.whatsapp_number}
          placeholder={phonePlaceholder}
          className={inputClass}
        />
        <p className="mt-2 text-xs text-slate-500">Customer orders arrive on this number.</p>

        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Country: <span className="font-semibold text-slate-800">{countryName}</span> · prices in{" "}
          {currencyCode}.{" "}
          <a href="/try" className="font-semibold text-emerald-800 underline">
            Wrong country? Build again
          </a>
        </p>
      </section>

      {/* 2. Ordering */}
      <section className={sectionClass}>
        <h2 className="text-lg font-bold text-emerald-950">2. How customers order</h2>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(
            [
              ["delivery_enabled", "Delivery"],
              ["pickup_enabled", "Takeaway"],
              ["car_pickup_enabled", "Bring to my car"],
              ["dine_in_enabled", "Dine in"]
            ] as const
          ).map(([name, label]) => (
            <label
              key={name}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-800 has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50"
            >
              <input
                type="checkbox"
                name={name}
                defaultChecked={v[name] === "on"}
                onChange={name === "delivery_enabled" ? (event) => setDelivery(event.target.checked) : undefined}
              />
              {label}
            </label>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {delivery ? (
            <label className="block">
              <span className={labelClass}>Delivery fee ({currencyCode})</span>
              <input
                name="delivery_fee"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                placeholder="0"
                defaultValue={v.delivery_fee}
                className={inputClass}
              />
            </label>
          ) : null}
          <label className="block">
            <span className={labelClass}>Minimum order ({currencyCode})</span>
            <input
              name="minimum_order_amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              placeholder="0"
              defaultValue={v.minimum_order_amount}
              className={inputClass}
            />
          </label>
        </div>

        <div className="mt-5">
          <span className={labelClass}>Café location</span>
          <input type="hidden" name="latitude" value={coords.latitude} />
          <input type="hidden" name="longitude" value={coords.longitude} />
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locationStatus.kind === "locating"}
            className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-600 px-4 py-3 font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
          >
            {locationStatus.kind === "locating" ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <LocateFixed size={18} />
            )}
            {locationStatus.kind === "set" ? "Location saved. Update it" : "Use my current location"}
          </button>
          <p
            className={`mt-2 text-xs ${locationStatus.kind === "error" ? "text-rose-600" : "text-slate-500"}`}
          >
            {locationStatus.kind === "error"
              ? locationStatus.message
              : locationStatus.kind === "set"
                ? `Saved ${coords.latitude}, ${coords.longitude}${
                    locationStatus.accuracy ? ` (within about ${locationStatus.accuracy} m)` : ""
                  }.`
                : "Tap this while you're at the café. It sets your delivery area."}
          </p>
          <input
            name="location_text"
            value={locationText}
            onChange={(event) => {
              setLocationText(event.target.value);
              setCoords({ latitude: "", longitude: "" });
              setLocationStatus({ kind: "idle" });
            }}
            placeholder="…or paste a Google Maps link or coordinates"
            className={inputClass}
          />
          {locationText ? (
            <p className={`mt-2 text-xs ${pasted ? "text-emerald-700" : "text-amber-700"}`}>
              {pasted
                ? `Found ${pasted.latitude}, ${pasted.longitude}.`
                : "Can't read a location from this. Short maps.app.goo.gl links don't work. Open the link and copy the full address bar, or use the button."}
            </p>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="col-span-2 block sm:col-span-1">
            <span className={labelClass}>Area / address</span>
            <input
              name="address"
              maxLength={300}
              placeholder="Al Nuaimiya, Ajman"
              defaultValue={v.address}
              className={inputClass}
            />
          </label>
          {delivery ? (
            <label className="col-span-2 block sm:col-span-1">
              <span className={labelClass}>Delivery radius (km)</span>
              <input
                name="delivery_radius_km"
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.5"
                placeholder="No limit"
                defaultValue={v.delivery_radius_km}
                className={inputClass}
              />
            </label>
          ) : null}
        </div>
      </section>

      {/* 3. Hours */}
      <section className={sectionClass}>
        <h2 className="text-lg font-bold text-emerald-950">3. Opening hours</h2>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(
            [
              ["set", "Set hours"],
              ["always", "Always open"]
            ] as const
          ).map(([mode, label]) => (
            <label
              key={mode}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-800 has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50"
            >
              <input
                type="radio"
                name="hours_mode"
                value={mode}
                checked={hoursMode === mode}
                onChange={() => setHoursMode(mode)}
              />
              {label}
            </label>
          ))}
        </div>

        {hoursMode === "set" ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block">
                <span className={labelClass}>Opens</span>
                <input name="open_time" type="time" required defaultValue={v.open_time} className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Closes</span>
                <input name="close_time" type="time" required defaultValue={v.close_time} className={inputClass} />
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Same hours every day. Late nights like 6 PM–2 AM work. You can set each day
              separately later in Settings.
            </p>
            <fieldset className="mt-4">
              <legend className={labelClass}>Closed on</legend>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {weekDays.map((day) => (
                  <label
                    key={day}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700 has-[:checked]:border-rose-400 has-[:checked]:bg-rose-50 has-[:checked]:text-rose-800"
                  >
                    <input
                      type="checkbox"
                      name="closed_days"
                      value={day}
                      defaultChecked={closedDays.has(day)}
                      className="sr-only"
                    />
                    {weekDayLabels[day].slice(0, 3)}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-600">Customers can order at any time.</p>
        )}
      </section>

      {/* Owner + submit */}
      <section className={sectionClass}>
        <label className={labelClass} htmlFor="claim-email">
          Owner email
        </label>
        <input
          id="claim-email"
          name="owner_email"
          type="email"
          required
          autoComplete="email"
          maxLength={254}
          defaultValue={v.owner_email}
          className={inputClass}
        />
        <p className="mt-2 text-xs text-slate-500">
          We email you a link to open your dashboard. One restaurant per email.
        </p>

        {state.error ? (
          <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3.5 font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-60"
        >
          {pending ? <Loader2 className="animate-spin" size={18} /> : null}
          Go live &amp; start my 14-day free trial
        </button>
        <p className="mt-3 text-center text-xs text-slate-500">No card required. Change any of this later in Settings.</p>
      </section>
    </form>
  );
}
