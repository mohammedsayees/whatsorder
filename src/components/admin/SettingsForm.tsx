import { updateRestaurantSettingsAction } from "@/app/actions";
import { BrandImageUploader } from "@/components/shared/BrandImageUploader";
import { WeeklyHoursFields } from "@/components/shared/WeeklyHoursFields";
import type { Restaurant } from "@/lib/types";

export function SettingsForm({
  restaurant,
  canWrite
}: {
  restaurant: Restaurant;
  canWrite: boolean;
}) {
  return (
    <form action={updateRestaurantSettingsAction} className="max-w-2xl rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="text-lg font-black">Brand images</h2>
          <p className="mt-1 text-sm text-stone-500">
            Upload directly from this device. Images are saved to this restaurant only.
          </p>
        </div>
        <BrandImageUploader
          canWrite={canWrite}
          currentUrl={restaurant.logo_url}
          kind="logo"
        />
        <BrandImageUploader
          canWrite={canWrite}
          currentUrl={restaurant.cover_image_url}
          kind="cover"
        />
        <label className="block sm:col-span-2">
          <span className="text-sm font-bold">Restaurant name</span>
          <input className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2" defaultValue={restaurant.name} disabled={!canWrite} name="name" required />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-bold">Restaurant name in Arabic</span>
          <input className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-right" defaultValue={restaurant.name_ar ?? ""} dir="rtl" disabled={!canWrite} name="name_ar" />
        </label>
        <label className="block">
          <span className="text-sm font-bold">WhatsApp number</span>
          <input className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2" defaultValue={restaurant.whatsapp_number} disabled={!canWrite} name="whatsapp_number" required />
          <span className="mt-1 block text-xs font-medium text-stone-500">
            Use country code format, for example 971554822424. Local UAE numbers starting with 05 will be converted automatically.
          </span>
        </label>
        <fieldset className="rounded-lg border border-stone-200 p-4 sm:col-span-2">
          <legend className="px-1 text-sm font-bold">Available order types</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {[
              ["delivery_enabled", "Delivery", restaurant.delivery_enabled !== false],
              ["pickup_enabled", "Takeaway", restaurant.pickup_enabled === true],
              [
                "car_pickup_enabled",
                "Bring to My Car",
                restaurant.car_pickup_enabled === true
              ],
              [
                "dine_in_enabled",
                "Dine In",
                restaurant.dine_in_enabled === true
              ]
            ].map(([name, label, checked]) => (
              <label className="flex items-center gap-2 text-sm font-bold" key={String(name)}>
                <input
                  defaultChecked={Boolean(checked)}
                  disabled={!canWrite}
                  name={String(name)}
                  type="checkbox"
                />
                {String(label)}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:col-span-2">
          <input
            className="mt-1"
            defaultChecked={restaurant.accepting_orders !== false}
            disabled={!canWrite}
            name="accepting_orders"
            type="checkbox"
          />
          <span>
            <span className="block text-sm font-black text-amber-950">
              Accept new customer orders
            </span>
            <span className="mt-1 block text-xs leading-5 text-amber-800">
              Turn this off temporarily when the kitchen is closed or unable to accept orders.
              The menu remains visible, but customers cannot add or submit items.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-stone-200 p-4 sm:col-span-2">
          <input
            className="mt-1"
            defaultChecked={restaurant.status_notifications_enabled !== false}
            disabled={!canWrite}
            name="status_notifications_enabled"
            type="checkbox"
          />
          <span>
            <span className="block text-sm font-black">
              Send order status updates to customers on WhatsApp
            </span>
            <span className="mt-1 block text-xs leading-5 text-stone-500">
              Customers who ordered via WhatsApp get a free message when their order is
              accepted, ready, out for delivery, completed, or cancelled. Sent only inside
              the free 24-hour reply window — never billed.
            </span>
          </span>
        </label>
        <div className="sm:col-span-2">
          <WeeklyHoursFields
            canWrite={canWrite}
            enabled={restaurant.opening_hours_enabled === true}
            openingHours={restaurant.opening_hours}
          />
        </div>
        <label className="flex items-start gap-3 rounded-lg border border-stone-200 p-4 sm:col-span-2">
          <input
            className="mt-1"
            defaultChecked={restaurant.public_reviews_enabled === true}
            disabled={!canWrite}
            name="public_reviews_enabled"
            type="checkbox"
          />
          <span>
            <span className="block text-sm font-black">Show verified reviews publicly</span>
            <span className="mt-1 block text-xs leading-5 text-stone-500">
              The overall rating includes every verified submission. Only approved written comments
              are displayed on the customer menu.
            </span>
          </span>
        </label>
        <label className="block">
          <span className="text-sm font-bold">Active</span>
          <div className="mt-3">
            <input defaultChecked={restaurant.is_active} disabled={!canWrite} name="is_active" type="checkbox" />
          </div>
        </label>
        <label className="block">
          <span className="text-sm font-bold">Delivery fee</span>
          <input className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2" defaultValue={restaurant.delivery_fee} disabled={!canWrite} min="0" name="delivery_fee" step="0.01" type="number" required />
        </label>
        <label className="block">
          <span className="text-sm font-bold">Minimum order</span>
          <input className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2" defaultValue={restaurant.minimum_order_amount} disabled={!canWrite} min="0" name="minimum_order_amount" step="0.01" type="number" required />
        </label>
        <label className="block">
          <span className="text-sm font-bold">Aggregator commission rate (%)</span>
          <input
            className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
            defaultValue={restaurant.commission_rate ?? ""}
            disabled={!canWrite}
            inputMode="decimal"
            max="100"
            min="0"
            name="commission_rate"
            placeholder="27"
            step="0.5"
            type="number"
          />
          <span className="mt-1 block text-xs font-medium text-stone-500">
            What Talabat used to charge on delivery orders. Drives the
            &ldquo;commission kept&rdquo; figure on your dashboard. Leave blank to
            use the 27% default.
          </span>
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-bold">Address</span>
          <textarea className="focus-ring mt-1 min-h-24 w-full rounded-lg border border-stone-200 px-3 py-2" defaultValue={restaurant.address ?? ""} disabled={!canWrite} name="address" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-bold">Address in Arabic</span>
          <textarea className="focus-ring mt-1 min-h-24 w-full rounded-lg border border-stone-200 px-3 py-2 text-right" defaultValue={restaurant.address_ar ?? ""} dir="rtl" disabled={!canWrite} name="address_ar" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-bold">Arabic subtitle / cuisine tags</span>
          <input className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-right" defaultValue={restaurant.subtitle_ar ?? ""} dir="rtl" disabled={!canWrite} name="subtitle_ar" placeholder="مثال: كرك، برجر، شاورما" />
        </label>
        <fieldset className="rounded-lg border border-stone-200 p-4 sm:col-span-2">
          <legend className="px-1 text-sm font-bold">Delivery area</legend>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            Set your restaurant location and a delivery radius to block delivery orders from
            customers outside range. To get the coordinates, open{" "}
            <a
              className="font-bold text-leaf underline"
              href="https://www.google.com/maps"
              rel="noreferrer"
              target="_blank"
            >
              Google Maps
            </a>
            , right-click your restaurant and click the latitude, longitude pair to copy it.
            Leave the radius empty for unlimited delivery (default).
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-bold">Latitude</span>
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
                defaultValue={restaurant.latitude ?? ""}
                disabled={!canWrite}
                inputMode="decimal"
                name="latitude"
                placeholder="25.4052"
                step="any"
                type="number"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold">Longitude</span>
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
                defaultValue={restaurant.longitude ?? ""}
                disabled={!canWrite}
                inputMode="decimal"
                name="longitude"
                placeholder="55.5136"
                step="any"
                type="number"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold">Delivery radius (km)</span>
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
                defaultValue={restaurant.delivery_radius_km ?? ""}
                disabled={!canWrite}
                inputMode="decimal"
                min="0"
                name="delivery_radius_km"
                placeholder="No limit"
                step="0.1"
                type="number"
              />
            </label>
          </div>
        </fieldset>
      </div>
      <button className="focus-ring mt-5 rounded-lg bg-leaf px-5 py-3 font-bold text-white disabled:opacity-50" disabled={!canWrite} type="submit">
        Save settings
      </button>
      <p className="mt-4 text-sm leading-6 text-stone-500">
        Future subscription billing and multi-branch support can attach to this restaurant settings area.
      </p>
    </form>
  );
}
