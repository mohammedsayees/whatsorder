"use client";

import Link from "next/link";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { formatAED } from "@/lib/currency";
import { useCart } from "@/components/customer/CartProvider";
import type { MenuCategory, MenuItem, Restaurant } from "@/lib/types";

export function RestaurantMenu({
  restaurant,
  categories,
  items
}: {
  restaurant: Restaurant;
  categories: MenuCategory[];
  items: MenuItem[];
}) {
  const cart = useCart();
  const availableItems = items.filter((item) => item.is_available);

  return (
    <>
      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6 lg:px-8">
        <section className="rounded-2xl bg-ink px-5 py-6 text-white shadow-soft sm:px-8">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white text-xl font-black text-leaf">
              {restaurant.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-mint">Open for WhatsApp orders</p>
              <h1 className="mt-1 text-2xl font-black sm:text-4xl">{restaurant.name}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/78">
                Browse the menu, build a structured order, and send it directly on WhatsApp.
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-3 text-sm text-white/82 sm:grid-cols-3">
            <div className="rounded-xl bg-white/10 p-3">Delivery fee {formatAED(restaurant.delivery_fee)}</div>
            <div className="rounded-xl bg-white/10 p-3">
              Minimum order {formatAED(restaurant.minimum_order_amount)}
            </div>
            <div className="rounded-xl bg-white/10 p-3">{restaurant.address ?? "UAE restaurant"}</div>
          </div>
        </section>

        <section className="mt-6 space-y-7">
          {categories.map((category) => {
            const categoryItems = availableItems.filter((item) => item.category_id === category.id);

            if (categoryItems.length === 0) {
              return null;
            }

            return (
              <div key={category.id} id={category.id}>
                <h2 className="mb-3 text-lg font-black">{category.name}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {categoryItems.map((item) => {
                    const cartLine = cart.lines.find((line) => line.item_id === item.id);

                    return (
                      <article
                        key={item.id}
                        className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
                        data-testid={`menu-item-${item.id}`}
                      >
                        <div className="flex gap-4">
                          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-linen text-xs font-bold text-ink/60">
                            {item.is_featured ? "Popular" : "Menu"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <h3 className="font-bold">{item.name}</h3>
                              <p className="shrink-0 font-black text-leaf">{formatAED(item.price)}</p>
                            </div>
                            <p className="mt-1 min-h-10 text-sm leading-5 text-stone-600">
                              {item.description}
                            </p>
                            <div className="mt-4 flex items-center justify-between">
                              {cartLine ? (
                                <div className="inline-flex items-center overflow-hidden rounded-full border border-stone-200 bg-stone-50">
                                  <button
                                    className="focus-ring grid h-9 w-9 place-items-center text-stone-700"
                                    onClick={() => cart.decrement(item.id)}
                                    type="button"
                                    aria-label={`Remove ${item.name}`}
                                  >
                                    <Minus size={16} />
                                  </button>
                                  <span className="w-8 text-center text-sm font-bold">{cartLine.quantity}</span>
                                  <button
                                    className="focus-ring grid h-9 w-9 place-items-center text-stone-700"
                                    onClick={() => cart.increment(item.id)}
                                    type="button"
                                    aria-label={`Add more ${item.name}`}
                                  >
                                    <Plus size={16} />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs font-semibold text-stone-500">Ready to add</span>
                              )}
                              <button
                                className="focus-ring inline-flex items-center gap-2 rounded-full bg-leaf px-4 py-2 text-sm font-bold text-white"
                                data-testid={`add-item-${item.id}`}
                                onClick={() => cart.addItem(item)}
                                type="button"
                              >
                                <Plus size={16} />
                                Add
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      </main>

      {cart.count > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 p-4 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                {cart.count} item{cart.count > 1 ? "s" : ""} in cart
              </p>
              <p className="font-black">{formatAED(cart.subtotal)}</p>
            </div>
            <Link
              href={`/r/${restaurant.slug}/checkout`}
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white"
            >
              <ShoppingBag size={17} />
              Checkout
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}
