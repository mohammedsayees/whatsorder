import type { Restaurant, RestaurantPlan, RestaurantStatus } from "@/lib/types";

const statuses: RestaurantStatus[] = [
  "draft",
  "onboarding",
  "live",
  "trial",
  "paid",
  "paused",
  "cancelled"
];

const plans: RestaurantPlan[] = ["trial", "starter", "growth", "pro", "custom"];

const inputClass =
  "focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm";

export function RestaurantForm({
  action,
  restaurant,
  mode
}: {
  action: (formData: FormData) => void | Promise<void>;
  restaurant?: Restaurant;
  mode: "create" | "edit";
}) {
  return (
    <form action={action} className="space-y-6">
      {restaurant ? <input name="restaurant_id" type="hidden" value={restaurant.id} /> : null}

      <section className="border-b border-stone-200 pb-6">
        <h2 className="text-lg font-black">Restaurant details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold">Restaurant name</span>
            <input className={inputClass} defaultValue={restaurant?.name ?? ""} name="name" required />
          </label>
          <label className="block">
            <span className="text-sm font-bold">Public slug</span>
            <input
              className={inputClass}
              defaultValue={restaurant?.slug ?? ""}
              name="slug"
              pattern="[a-z0-9-]+"
              placeholder="demo-cafeteria"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold">WhatsApp order number</span>
            <input
              className={inputClass}
              defaultValue={restaurant?.whatsapp_number ?? ""}
              inputMode="tel"
              name="whatsapp_number"
              placeholder="971554822424"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold">Cuisine / subtitle</span>
            <input className={inputClass} defaultValue={restaurant?.subtitle ?? ""} name="subtitle" />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-bold">Address</span>
            <textarea
              className={`${inputClass} min-h-24`}
              defaultValue={restaurant?.address ?? ""}
              name="address"
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold">City</span>
            <input className={inputClass} defaultValue={restaurant?.city ?? ""} name="city" />
          </label>
          <label className="block">
            <span className="text-sm font-bold">Delivery fee</span>
            <input
              className={inputClass}
              defaultValue={restaurant?.delivery_fee ?? 0}
              min="0"
              name="delivery_fee"
              step="0.01"
              type="number"
            />
          </label>
        </div>
      </section>

      <section className="border-b border-stone-200 pb-6">
        <h2 className="text-lg font-black">Owner contact</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm font-bold">Owner name</span>
            <input className={inputClass} defaultValue={restaurant?.owner_name ?? ""} name="owner_name" />
          </label>
          <label className="block">
            <span className="text-sm font-bold">Owner email</span>
            <input
              className={inputClass}
              defaultValue={restaurant?.owner_email ?? ""}
              name="owner_email"
              type="email"
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold">Owner phone</span>
            <input
              className={inputClass}
              defaultValue={restaurant?.owner_phone ?? ""}
              inputMode="tel"
              name="owner_phone"
            />
          </label>
        </div>
      </section>

      {mode === "edit" ? (
        <section className="border-b border-stone-200 pb-6">
          <h2 className="text-lg font-black">Brand and fulfilment</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold">Logo URL</span>
              <input className={inputClass} defaultValue={restaurant?.logo_url ?? ""} name="logo_url" type="url" />
            </label>
            <label className="block">
              <span className="text-sm font-bold">Cover image URL</span>
              <input
                className={inputClass}
                defaultValue={restaurant?.cover_image_url ?? ""}
                name="cover_image_url"
                type="url"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-5">
            {[
              ["pickup_enabled", "Pickup enabled", restaurant?.pickup_enabled ?? true],
              ["delivery_enabled", "Delivery enabled", restaurant?.delivery_enabled ?? true],
              [
                "scheduled_orders_enabled",
                "Scheduled orders enabled",
                restaurant?.scheduled_orders_enabled ?? false
              ]
            ].map(([name, label, checked]) => (
              <label className="flex items-center gap-2 text-sm font-bold" key={String(name)}>
                <input defaultChecked={Boolean(checked)} name={String(name)} type="checkbox" />
                {String(label)}
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-lg font-black">Lifecycle</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold">Status</span>
            <select className={inputClass} defaultValue={restaurant?.status ?? "draft"} name="status">
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold">Plan</span>
            <select className={inputClass} defaultValue={restaurant?.plan ?? "trial"} name="plan">
              {plans.map((plan) => (
                <option key={plan} value={plan}>
                  {plan.charAt(0).toUpperCase() + plan.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <button className="focus-ring rounded-lg bg-leaf px-5 py-3 text-sm font-black text-white" type="submit">
        {mode === "create" ? "Create restaurant" : "Save restaurant settings"}
      </button>
    </form>
  );
}
