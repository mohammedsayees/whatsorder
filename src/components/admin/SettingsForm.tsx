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
        <label className="block">
          <span className="text-sm font-bold">WhatsApp number</span>
          <input className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2" defaultValue={restaurant.whatsapp_number} disabled={!canWrite} name="whatsapp_number" required />
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
        <label className="block sm:col-span-2">
          <span className="text-sm font-bold">Address</span>
          <textarea className="focus-ring mt-1 min-h-24 w-full rounded-lg border border-stone-200 px-3 py-2" defaultValue={restaurant.address ?? ""} disabled={!canWrite} name="address" />
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
