import { BrandImageUploader } from "@/components/shared/BrandImageUploader";
import { WeeklyHoursFields } from "@/components/shared/WeeklyHoursFields";
import type { Restaurant, RestaurantPlan, RestaurantStatus } from "@/lib/types";
import { countryProfiles, getCountryProfile } from "@/lib/localization";

const statuses: RestaurantStatus[] = [
  "draft",
  "onboarding",
  "live",
  "trial",
  "paid",
  "paused",
  "cancelled"
];

const plans: RestaurantPlan[] = ["trial", "starter", "pro", "multi_branch"];

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
  const restaurantProfile = getCountryProfile(restaurant?.country_code);

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
          {restaurant ? (
            <div className="block">
              <span className="text-sm font-bold">Country profile</span>
              <input name="country_code" type="hidden" value={restaurantProfile.countryCode} />
              <p className={`${inputClass} bg-stone-50 text-stone-600`}>
                {restaurantProfile.countryName} · {restaurantProfile.currencyCode} ·{" "}
                {restaurantProfile.timeZone}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                Fixed after onboarding to protect historical prices and customer phones.
              </p>
            </div>
          ) : (
            <label className="block">
              <span className="text-sm font-bold">Country profile</span>
              <select className={inputClass} defaultValue="AE" name="country_code">
                {Object.values(countryProfiles).map((profile) => (
                  <option key={profile.countryCode} value={profile.countryCode}>
                    {profile.countryName} · {profile.currencyCode} · {profile.timeZone}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-sm font-bold">WhatsApp order number</span>
            <input
              className={inputClass}
              defaultValue={restaurant?.whatsapp_number ?? ""}
              inputMode="tel"
              name="whatsapp_number"
              placeholder={
                countryProfiles[restaurant?.country_code ?? "AE"].phoneExample
              }
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
          <label className="block">
            <span className="text-sm font-bold">Minimum order amount</span>
            <input
              className={inputClass}
              defaultValue={restaurant?.minimum_order_amount ?? 0}
              min="0"
              name="minimum_order_amount"
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
            <BrandImageUploader
              canWrite
              currentUrl={restaurant?.logo_url}
              kind="logo"
              restaurantId={restaurant?.id}
            />
            <BrandImageUploader
              canWrite
              currentUrl={restaurant?.cover_image_url}
              kind="cover"
              restaurantId={restaurant?.id}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-5">
            {[
              ["pickup_enabled", "Pickup enabled", restaurant?.pickup_enabled ?? true],
              [
                "car_pickup_enabled",
                "Bring to My Car enabled",
                restaurant?.car_pickup_enabled ?? false
              ],
              ["dine_in_enabled", "Dine In enabled", restaurant?.dine_in_enabled ?? false],
              ["delivery_enabled", "Delivery enabled", restaurant?.delivery_enabled ?? true],
              [
                "scheduled_orders_enabled",
                "Scheduled orders enabled",
                restaurant?.scheduled_orders_enabled ?? false
              ],
              [
                "public_reviews_enabled",
                "Public verified reviews enabled",
                restaurant?.public_reviews_enabled ?? false
              ],
              [
                "accepting_orders",
                "Accepting new orders",
                restaurant?.accepting_orders ?? true
              ]
            ].map(([name, label, checked]) => (
              <label className="flex items-center gap-2 text-sm font-bold" key={String(name)}>
                <input defaultChecked={Boolean(checked)} name={String(name)} type="checkbox" />
                {String(label)}
              </label>
            ))}
          </div>
          <div className="mt-5">
            <WeeklyHoursFields
              enabled={restaurant?.opening_hours_enabled === true}
              openingHours={restaurant?.opening_hours}
              timeZone={restaurant?.time_zone}
            />
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

      {mode === "create" ? (
        <label className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <input className="mt-1" defaultChecked name="send_owner_invite" type="checkbox" />
          <span>
            <span className="block text-sm font-black text-emerald-900">Send owner invitation</span>
            <span className="mt-1 block text-xs leading-5 text-emerald-800">
              The owner will receive an email to activate their account and create a password.
            </span>
          </span>
        </label>
      ) : null}

      <button className="focus-ring rounded-lg bg-leaf px-5 py-3 text-sm font-black text-white" type="submit">
        {mode === "create" ? "Create restaurant" : "Save restaurant settings"}
      </button>
    </form>
  );
}
