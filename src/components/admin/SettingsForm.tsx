import { updateRestaurantSettingsAction } from "@/app/actions";
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
