"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import { createOrderAction } from "@/app/actions";
import { formatAED } from "@/lib/currency";
import { useCart } from "@/components/customer/CartProvider";
import type { Restaurant } from "@/lib/types";

export function CheckoutForm({ restaurant }: { restaurant: Restaurant }) {
  const router = useRouter();
  const cart = useCart();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const total = useMemo(() => cart.subtotal + restaurant.delivery_fee, [cart.subtotal, restaurant.delivery_fee]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    formData.set("items", JSON.stringify(cart.lines));

    startTransition(async () => {
      const result = await createOrderAction(restaurant.slug, formData);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      cart.clearCart();
      window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");
      router.push(`/r/${restaurant.slug}/thank-you?order=${encodeURIComponent(result.orderId)}`);
    });
  }

  if (!cart.isReady) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10 text-center">
        <h1 className="text-2xl font-black">Loading your cart</h1>
        <p className="mt-3 text-stone-600">Preparing checkout details...</p>
      </main>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10 text-center">
        <h1 className="text-2xl font-black">Your cart is empty</h1>
        <p className="mt-3 text-stone-600">Add a few items from the menu before checkout.</p>
        <Link
          className="focus-ring mt-6 inline-flex justify-center rounded-full bg-leaf px-5 py-3 font-bold text-white"
          href={`/r/${restaurant.slug}`}
        >
          Back to menu
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
      <section>
        <Link
          href={`/r/${restaurant.slug}`}
          className="focus-ring mb-5 inline-flex items-center gap-2 rounded-full px-2 py-2 text-sm font-bold text-stone-700"
        >
          <ArrowLeft size={17} />
          Menu
        </Link>
        <h1 className="text-3xl font-black">Checkout</h1>
        <p className="mt-2 text-stone-600">Send a clear order to {restaurant.name} on WhatsApp.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <input name="items" type="hidden" />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold">Name</span>
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-4 py-3"
                name="customer_name"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold">Phone number</span>
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-4 py-3"
                inputMode="tel"
                name="customer_phone"
                required
              />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-bold">Delivery area</span>
            <input
              className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-4 py-3"
              name="delivery_area"
              placeholder="Al Nahda, Deira, Business Bay..."
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold">Full address</span>
            <textarea
              className="focus-ring mt-1 min-h-24 w-full rounded-lg border border-stone-200 bg-white px-4 py-3"
              name="delivery_address"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold">Notes</span>
            <textarea
              className="focus-ring mt-1 min-h-20 w-full rounded-lg border border-stone-200 bg-white px-4 py-3"
              name="notes"
              placeholder="No onions, extra spicy, call on arrival..."
            />
          </label>
          <fieldset className="rounded-lg border border-stone-200 bg-white p-4">
            <legend className="px-1 text-sm font-bold">Payment method</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {["Cash on Delivery", "Card on Delivery"].map((method) => (
                <label
                  className="flex items-center gap-3 rounded-lg border border-stone-200 px-3 py-3 text-sm font-semibold"
                  key={method}
                >
                  <input defaultChecked={method === "Cash on Delivery"} name="payment_method" type="radio" value={method} />
                  {method}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex gap-3 rounded-lg border border-stone-200 bg-white p-4 text-sm leading-6">
            <input className="mt-1" name="consent_order_processing" required type="checkbox" />
            <span>I agree that my details will be shared with the restaurant to process this order.</span>
          </label>
          <label className="flex gap-3 rounded-lg border border-stone-200 bg-white p-4 text-sm leading-6">
            <input className="mt-1" name="consent_marketing" type="checkbox" />
            <span>I would like to receive offers from this restaurant.</span>
          </label>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}

          <button
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-full bg-leaf px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            <Send size={18} />
            {isPending ? "Saving order..." : "Send Order on WhatsApp"}
          </button>
        </form>
      </section>

      <aside className="h-fit rounded-lg border border-stone-200 bg-white p-4 shadow-sm lg:sticky lg:top-5">
        <h2 className="text-lg font-black">Order summary</h2>
        <div className="mt-4 space-y-3">
          {cart.lines.map((line) => (
            <div className="flex items-start justify-between gap-3 text-sm" key={line.item_id}>
              <div>
                <p className="font-bold">{line.name}</p>
                <p className="text-stone-500">Qty {line.quantity}</p>
              </div>
              <p className="font-bold">{formatAED(line.price * line.quantity)}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 space-y-2 border-t border-stone-200 pt-4 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <strong>{formatAED(cart.subtotal)}</strong>
          </div>
          <div className="flex justify-between">
            <span>Delivery</span>
            <strong>{formatAED(restaurant.delivery_fee)}</strong>
          </div>
          <div className="flex justify-between text-lg">
            <span className="font-black">Total</span>
            <strong>{formatAED(total)}</strong>
          </div>
        </div>
      </aside>
    </main>
  );
}
