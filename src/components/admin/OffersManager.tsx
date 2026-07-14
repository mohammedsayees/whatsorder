"use client";

import {
  addMenuOfferAction,
  deleteMenuOfferAction,
  toggleMenuOfferAction,
  updateMenuOfferLimitAction
} from "@/app/actions";
import { formatAED } from "@/lib/currency";
import { formatUaeDate } from "@/lib/date-time";
import type { MenuItem, MenuOffer } from "@/lib/types";

export function OffersManager({
  canWrite,
  items,
  offers,
  restaurantId
}: {
  canWrite: boolean;
  items: MenuItem[];
  offers: MenuOffer[];
  restaurantId?: string;
}) {
  const availableItems = items.filter((item) => item.is_available);
  const itemsById = new Map(items.map((item) => [item.id, item]));

  return (
    <section className="space-y-5 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-lg font-black">Offer carousel</h2>
        <p className="mt-1 text-sm text-stone-500">
          Promote existing items with a lower price. Active offers appear above the customer menu.
        </p>
      </div>

      <form action={addMenuOfferAction} className="grid gap-3 rounded-lg bg-stone-50 p-4 lg:grid-cols-2">
        {restaurantId ? <input name="restaurant_id" type="hidden" value={restaurantId} /> : null}
        <label className="block">
          <span className="text-sm font-bold">Menu item</span>
          <select
            className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5"
            disabled={!canWrite || availableItems.length === 0}
            name="menu_item_id"
            required
          >
            {availableItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {formatAED(item.price)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold">Offer price</span>
          <input
            className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5"
            disabled={!canWrite}
            min="0"
            name="promotional_price"
            required
            step="0.01"
            type="number"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold">Maximum quantity per order</span>
          <input
            className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5"
            defaultValue={1}
            disabled={!canWrite}
            max="25"
            min="1"
            name="max_quantity_per_order"
            required
            type="number"
          />
          <span className="mt-1 block text-xs text-stone-500">
            Customers receive the offer price up to this quantity.
          </span>
        </label>
        <label className="block">
          <span className="text-sm font-bold">Offer title</span>
          <input
            className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5"
            disabled={!canWrite}
            maxLength={120}
            name="title"
            placeholder="Breakfast combo offer"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold">Arabic title</span>
          <input
            className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-right"
            dir="rtl"
            disabled={!canWrite}
            maxLength={120}
            name="title_ar"
            placeholder="عنوان العرض"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold">Description</span>
          <input
            className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5"
            disabled={!canWrite}
            maxLength={300}
            name="description"
            placeholder="Limited-time café special"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold">Arabic description</span>
          <input
            className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-right"
            dir="rtl"
            disabled={!canWrite}
            maxLength={300}
            name="description_ar"
            placeholder="وصف العرض"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold">Starts on (optional)</span>
          <input
            className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5"
            disabled={!canWrite}
            name="starts_on"
            type="date"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold">Ends on (optional)</span>
          <input
            className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5"
            disabled={!canWrite}
            name="ends_on"
            type="date"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-bold lg:col-span-2">
          <input defaultChecked disabled={!canWrite} name="is_active" type="checkbox" />
          Publish this offer
        </label>
        <button
          className="focus-ring rounded-lg bg-leaf px-4 py-3 font-black text-white disabled:opacity-50 lg:col-span-2"
          disabled={!canWrite || availableItems.length === 0}
          type="submit"
        >
          Add offer
        </button>
      </form>

      <div className="divide-y divide-stone-200 overflow-hidden rounded-lg border border-stone-200">
        {offers.map((offer) => {
          const item = itemsById.get(offer.menu_item_id);

          return (
            <article className="grid gap-3 p-4 lg:grid-cols-[1fr_auto_auto] lg:items-center" key={offer.id}>
              <div>
                <p className="font-black">{offer.title}</p>
                <p className="mt-1 text-sm text-stone-500">
                  {item?.name ?? "Deleted item"} ·{" "}
                  <span className="line-through">{formatAED(item?.price ?? 0)}</span>{" "}
                  <span className="font-black text-leaf">{formatAED(offer.promotional_price)}</span>
                </p>
                {offer.starts_at || offer.ends_at ? (
                  <p className="mt-1 text-xs font-semibold text-stone-400">
                    {offer.starts_at ? formatUaeDate(offer.starts_at) : "Now"} –{" "}
                    {offer.ends_at ? formatUaeDate(offer.ends_at) : "No expiry"}
                  </p>
                ) : null}
                <form
                  action={updateMenuOfferLimitAction}
                  className="mt-2 flex max-w-xs items-center gap-2"
                >
                  {restaurantId ? <input name="restaurant_id" type="hidden" value={restaurantId} /> : null}
                  <input name="offer_id" type="hidden" value={offer.id} />
                  <label className="text-xs font-bold text-stone-500" htmlFor={`offer-limit-${offer.id}`}>
                    Maximum per order
                  </label>
                  <input
                    className="focus-ring w-16 rounded-lg border border-stone-200 px-2 py-1.5 text-sm font-bold"
                    defaultValue={offer.max_quantity_per_order}
                    disabled={!canWrite}
                    id={`offer-limit-${offer.id}`}
                    max="25"
                    min="1"
                    name="max_quantity_per_order"
                    type="number"
                  />
                  <button
                    className="focus-ring rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-black"
                    disabled={!canWrite}
                    type="submit"
                  >
                    Save
                  </button>
                </form>
              </div>
              <form action={toggleMenuOfferAction}>
                {restaurantId ? <input name="restaurant_id" type="hidden" value={restaurantId} /> : null}
                <input name="offer_id" type="hidden" value={offer.id} />
                <input name="is_active" type="hidden" value={String(!offer.is_active)} />
                <button
                  className={`focus-ring rounded-full px-3 py-2 text-xs font-black ${
                    offer.is_active ? "bg-mint/20 text-leaf" : "bg-stone-100 text-stone-500"
                  }`}
                  disabled={!canWrite}
                  type="submit"
                >
                  {offer.is_active ? "Published" : "Hidden"}
                </button>
              </form>
              <form
                action={deleteMenuOfferAction}
                onSubmit={(event) => {
                  if (!window.confirm(`Delete the offer "${offer.title}"? This cannot be undone.`)) {
                    event.preventDefault();
                  }
                }}
              >
                {restaurantId ? <input name="restaurant_id" type="hidden" value={restaurantId} /> : null}
                <input name="offer_id" type="hidden" value={offer.id} />
                <button
                  className="focus-ring rounded-lg px-3 py-2 text-sm font-black text-rose-600"
                  disabled={!canWrite}
                  type="submit"
                >
                  Delete
                </button>
              </form>
            </article>
          );
        })}
        {offers.length === 0 ? (
          <p className="p-5 text-sm font-semibold text-stone-500">
            No offers yet. Add one to create the customer carousel.
          </p>
        ) : null}
      </div>
    </section>
  );
}
