"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import {
  createStaffOrderAction,
  type StaffOrderState
} from "@/app/admin/orders/actions";
import { formatAED } from "@/lib/currency";
import type { CartLine, FulfilmentType, MenuWithCategories } from "@/lib/types";

type TicketLine = {
  itemId: string;
  name: string;
  nameAr: string | null;
  price: number;
  quantity: number;
};

const fulfilmentLabels: Record<FulfilmentType, string> = {
  delivery: "Delivery",
  takeaway: "Takeaway",
  car_pickup: "Bring to My Car",
  dine_in: "Dine-in"
};

const initialState: StaffOrderState = {};

export function StaffOrderEntry({
  deliveryFee,
  menu,
  orderTypes
}: {
  deliveryFee: number;
  menu: MenuWithCategories;
  orderTypes: FulfilmentType[];
}) {
  const [state, action, pending] = useActionState(createStaffOrderAction, initialState);
  const [lines, setLines] = useState<Record<string, TicketLine>>({});
  const [search, setSearch] = useState("");
  const [fulfilmentType, setFulfilmentType] = useState<FulfilmentType>(orderTypes[0]);

  // Clear the ticket after a successful save so staff can punch the next order.
  useEffect(() => {
    if (state.success) {
      setLines({});
      setSearch("");
    }
  }, [state]);

  const availableItems = useMemo(
    () => menu.items.filter((item) => item.is_available),
    [menu.items]
  );

  const orderedCategories = useMemo(
    () =>
      [...menu.categories]
        .filter((category) => category.is_active)
        .sort((first, second) => first.display_order - second.display_order),
    [menu.categories]
  );

  const normalizedSearch = search.trim().toLowerCase();
  const matchingItems = normalizedSearch
    ? availableItems.filter((item) =>
        `${item.name} ${item.name_ar ?? ""}`.toLowerCase().includes(normalizedSearch)
      )
    : null;

  const ticketLines = Object.values(lines);
  const subtotal = ticketLines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const itemCount = ticketLines.reduce((sum, line) => sum + line.quantity, 0);
  const appliedDeliveryFee = fulfilmentType === "delivery" ? deliveryFee : 0;
  const total = subtotal + appliedDeliveryFee;

  function addItem(itemId: string, name: string, nameAr: string | null, price: number) {
    setLines((current) => {
      const existing = current[itemId];
      return {
        ...current,
        [itemId]: {
          itemId,
          name,
          nameAr,
          price,
          quantity: (existing?.quantity ?? 0) + 1
        }
      };
    });
  }

  function changeQuantity(itemId: string, delta: number) {
    setLines((current) => {
      const existing = current[itemId];
      if (!existing) {
        return current;
      }
      const nextQuantity = existing.quantity + delta;
      if (nextQuantity < 1) {
        const { [itemId]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [itemId]: { ...existing, quantity: nextQuantity } };
    });
  }

  function removeItem(itemId: string) {
    setLines((current) => {
      const { [itemId]: _removed, ...rest } = current;
      return rest;
    });
  }

  const cartPayload: CartLine[] = ticketLines.map((line) => ({
    item_id: line.itemId,
    name: line.name,
    name_ar: line.nameAr,
    price: line.price,
    quantity: line.quantity
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      {/* Menu picker */}
      <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            size={18}
          />
          <input
            className="focus-ring w-full rounded-lg border border-stone-200 py-3 pl-10 pr-3"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search the menu…"
            type="search"
            value={search}
          />
        </label>

        <div className="mt-4 space-y-6">
          {matchingItems ? (
            <ItemGrid
              items={matchingItems.map((item) => ({
                id: item.id,
                name: item.name,
                nameAr: item.name_ar ?? null,
                price: item.price
              }))}
              onAdd={addItem}
            />
          ) : (
            orderedCategories.map((category) => {
              const categoryItems = availableItems.filter(
                (item) => item.category_id === category.id
              );
              if (categoryItems.length === 0) {
                return null;
              }
              return (
                <div key={category.id}>
                  <h2 className="mb-2 text-sm font-black uppercase tracking-wide text-stone-500">
                    {category.name}
                  </h2>
                  <ItemGrid
                    items={categoryItems.map((item) => ({
                      id: item.id,
                      name: item.name,
                      nameAr: item.name_ar ?? null,
                      price: item.price
                    }))}
                    onAdd={addItem}
                  />
                </div>
              );
            })
          )}
          {matchingItems && matchingItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-500">
              No available items match “{search}”.
            </p>
          ) : null}
        </div>
      </section>

      {/* Ticket */}
      <section className="lg:sticky lg:top-6 lg:self-start">
        <form action={action} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-black">Ticket</h2>

          <div className="mt-3 space-y-2">
            {ticketLines.length === 0 ? (
              <p className="rounded-lg border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">
                Tap menu items to build the order.
              </p>
            ) : (
              ticketLines.map((line) => (
                <div
                  className="flex items-center gap-2 rounded-lg border border-stone-100 px-3 py-2"
                  key={line.itemId}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{line.name}</p>
                    <p className="text-xs text-stone-500">{formatAED(line.price)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      aria-label={`Reduce ${line.name}`}
                      className="focus-ring grid h-8 w-8 place-items-center rounded-lg border border-stone-200 hover:bg-stone-50"
                      onClick={() => changeQuantity(line.itemId, -1)}
                      type="button"
                    >
                      <Minus size={15} />
                    </button>
                    <span className="w-6 text-center text-sm font-black">{line.quantity}</span>
                    <button
                      aria-label={`Add ${line.name}`}
                      className="focus-ring grid h-8 w-8 place-items-center rounded-lg border border-stone-200 hover:bg-stone-50"
                      onClick={() => changeQuantity(line.itemId, 1)}
                      type="button"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                  <span className="w-16 text-right text-sm font-black">
                    {formatAED(line.price * line.quantity)}
                  </span>
                  <button
                    aria-label={`Remove ${line.name}`}
                    className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                    onClick={() => removeItem(line.itemId)}
                    type="button"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 space-y-1 border-t border-stone-100 pt-3">
            <div className="flex items-center justify-between text-sm text-stone-600">
              <span className="font-bold">
                {itemCount} item{itemCount === 1 ? "" : "s"}
              </span>
              <span>{formatAED(subtotal)}</span>
            </div>
            {appliedDeliveryFee > 0 ? (
              <div className="flex items-center justify-between text-sm text-stone-600">
                <span className="font-bold">Delivery fee</span>
                <span>{formatAED(appliedDeliveryFee)}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm font-bold text-stone-600">Total</span>
              <span className="text-lg font-black">{formatAED(total)}</span>
            </div>
          </div>

          {/* Order type — only the channels this restaurant offers */}
          <fieldset className="mt-4">
            <legend className="text-xs font-black uppercase tracking-wide text-stone-500">
              Order type
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {orderTypes.map((type) => (
                <button
                  className={`focus-ring rounded-lg border px-3 py-2 text-sm font-black ${
                    fulfilmentType === type
                      ? "border-leaf bg-mint text-leaf"
                      : "border-stone-200 text-stone-600 hover:bg-stone-50"
                  }`}
                  key={type}
                  onClick={() => setFulfilmentType(type)}
                  type="button"
                >
                  {fulfilmentLabels[type]}
                </button>
              ))}
            </div>
          </fieldset>

          {fulfilmentType === "delivery" ? (
            <div className="mt-3 space-y-3">
              <label className="block text-sm font-bold text-stone-700">
                Delivery area
                <input
                  className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                  maxLength={120}
                  name="delivery_area"
                  required
                  type="text"
                />
              </label>
              <label className="block text-sm font-bold text-stone-700">
                Delivery address
                <input
                  className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                  maxLength={500}
                  name="delivery_address"
                  required
                  type="text"
                />
              </label>
              <label className="block text-sm font-bold text-stone-700">
                Landmark <span className="font-normal text-stone-400">(optional)</span>
                <input
                  className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                  maxLength={250}
                  name="delivery_landmark"
                  type="text"
                />
              </label>
            </div>
          ) : null}

          {fulfilmentType === "car_pickup" ? (
            <div className="mt-3 space-y-3">
              <label className="block text-sm font-bold text-stone-700">
                Car plate number
                <input
                  className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                  maxLength={40}
                  name="car_plate_number"
                  required
                  type="text"
                />
              </label>
              <label className="block text-sm font-bold text-stone-700">
                Car colour / model{" "}
                <span className="font-normal text-stone-400">(optional)</span>
                <input
                  className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                  maxLength={120}
                  name="car_description"
                  type="text"
                />
              </label>
            </div>
          ) : null}

          {fulfilmentType === "dine_in" ? (
            <label className="mt-3 block text-sm font-bold text-stone-700">
              Table number
              <input
                className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                maxLength={40}
                name="table_number"
                required
                type="text"
              />
            </label>
          ) : null}

          {/* Optional customer + notes */}
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-bold text-stone-700">
              Customer name <span className="font-normal text-stone-400">(optional)</span>
              <input
                className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                maxLength={120}
                name="customer_name"
                placeholder="Walk-in customer"
                type="text"
              />
            </label>
            <label className="block text-sm font-bold text-stone-700">
              Phone <span className="font-normal text-stone-400">(optional)</span>
              <input
                className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                inputMode="tel"
                maxLength={24}
                name="customer_phone"
                type="tel"
              />
            </label>
            <label className="block text-sm font-bold text-stone-700">
              Notes <span className="font-normal text-stone-400">(optional)</span>
              <input
                className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                maxLength={1000}
                name="notes"
                type="text"
              />
            </label>
          </div>

          {/* Hidden submitted values */}
          <input name="items" type="hidden" value={JSON.stringify(cartPayload)} />
          <input name="fulfilment_type" type="hidden" value={fulfilmentType} />

          {state.error || state.success ? (
            <p
              className={`mt-4 rounded-lg px-3 py-2 text-sm font-bold ${
                state.error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"
              }`}
              role="status"
            >
              {state.error ?? state.success}
            </p>
          ) : null}

          {/* Primary flow: payment is collected later, at completion. */}
          <button
            className="focus-ring mt-4 w-full rounded-lg bg-leaf px-4 py-3 font-black text-white disabled:opacity-60"
            disabled={pending || ticketLines.length === 0}
            name="action"
            type="submit"
            value="kitchen"
          >
            {pending ? "Saving…" : "Send to kitchen"}
          </button>

          {/* Optional shortcut: customer pays up front. */}
          <div className="mt-3 rounded-lg border border-stone-200 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-stone-500">
              Or take payment now
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                className="focus-ring rounded-lg border border-leaf px-3 py-2 text-sm font-black text-leaf disabled:opacity-60"
                disabled={pending || ticketLines.length === 0}
                name="action"
                type="submit"
                value="paid_cash"
              >
                Paid · Cash
              </button>
              <button
                className="focus-ring rounded-lg border border-leaf px-3 py-2 text-sm font-black text-leaf disabled:opacity-60"
                disabled={pending || ticketLines.length === 0}
                name="action"
                type="submit"
                value="paid_card"
              >
                Paid · Card
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

function ItemGrid({
  items,
  onAdd
}: {
  items: { id: string; name: string; nameAr: string | null; price: number }[];
  onAdd: (id: string, name: string, nameAr: string | null, price: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((item) => (
        <button
          className="focus-ring flex h-full flex-col justify-between gap-2 rounded-lg border border-stone-200 p-3 text-left hover:border-leaf hover:bg-mint"
          key={item.id}
          onClick={() => onAdd(item.id, item.name, item.nameAr, item.price)}
          type="button"
        >
          <span className="text-sm font-bold leading-tight">{item.name}</span>
          <span className="text-sm font-black text-leaf">{formatAED(item.price)}</span>
        </button>
      ))}
    </div>
  );
}
