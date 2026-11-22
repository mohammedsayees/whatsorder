"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Minus, Pencil, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { cartLineKey, formatLineOptions } from "@/lib/cart-line";
import { formatCurrency } from "@/lib/currency";
import type { CustomerLanguage } from "@/lib/customer-i18n";
import type { CartLine, CustomerMenuOffer, PublicRestaurant } from "@/lib/types";
import { useCart } from "@/components/customer/CartProvider";

// The cart drawer opened from the menu's cart bar. Loaded on demand, so its
// code and copy stay out of the menu's first load.

const COPY = {
  en: {
    title: "Your cart",
    close: "Close",
    edit: "Edit",
    remove: "Remove",
    fewer: "Fewer",
    more: "More",
    clear: "Clear cart",
    confirmClear: "Tap again to clear",
    subtotal: "Subtotal",
    checkout: "Checkout",
    empty: "Your cart is empty.",
    minimum: (amount: string, minimum: string) => `Add ${amount} more to reach the ${minimum} minimum.`
  },
  ar: {
    title: "سلتك",
    close: "إغلاق",
    edit: "تعديل",
    remove: "حذف",
    fewer: "أقل",
    more: "أكثر",
    clear: "إفراغ السلة",
    confirmClear: "اضغط مرة أخرى للإفراغ",
    subtotal: "المجموع الفرعي",
    checkout: "إتمام الطلب",
    empty: "سلتك فارغة.",
    minimum: (amount: string, minimum: string) => `أضف ${amount} للوصول إلى الحد الأدنى ${minimum}.`
  }
} as const;

export function CartSheet({
  amountRemaining,
  checkoutHref,
  closedLabel,
  language,
  notice,
  offers,
  onClose,
  onEdit,
  restaurant
}: {
  amountRemaining: number;
  checkoutHref: string;
  /** Set while the café can't take orders: shown instead of Checkout. */
  closedLabel: string | null;
  language: CustomerLanguage;
  /** "1 item is no longer available…" from the menu check, if any. */
  notice: string | null;
  /** Live offers, so + respects an offer's per-order cap. */
  offers: CustomerMenuOffer[];
  onClose: () => void;
  /** Lines with options can be reopened in the item sheet. */
  onEdit: (line: CartLine, offer: CustomerMenuOffer | null) => void;
  restaurant: PublicRestaurant;
}) {
  // Cart actions live here (not in the menu) to keep the menu's first load small.
  const cart = useCart();
  const lines = cart.lines;
  const subtotal = cart.subtotal;
  const offerFor = (line: CartLine) =>
    line.offer_id ? offers.find((offer) => offer.id === line.offer_id) ?? null : null;
  const copy = COPY[language === "ar" ? "ar" : "en"];
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const money = (value: number) => formatCurrency(value, restaurant);
  const minimum = Number(restaurant.minimum_order_amount ?? 0);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Dialog behaviour: Escape closes, focus stays inside and comes back,
  // the menu behind does not scroll.
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href]")
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);

  const canCheckout = lines.length > 0 && amountRemaining <= 0 && !closedLabel;
  const progress = minimum > 0 ? Math.min(100, Math.round((subtotal / minimum) * 100)) : 100;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:max-w-md sm:rounded-[28px]"
        ref={dialogRef}
        role="dialog"
      >
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-black" id={titleId}>
            <ShoppingBag aria-hidden size={18} />
            {copy.title}
          </h2>
          <button
            aria-label={copy.close}
            className="focus-ring rounded-full bg-stone-100 p-2 text-stone-500"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3">
          {notice ? (
            <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900" role="status">
              {notice}
            </p>
          ) : null}
          {lines.length === 0 ? (
            <p className="py-8 text-center text-sm font-semibold text-stone-500">{copy.empty}</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {lines.map((line) => {
                const name = language === "ar" && line.name_ar ? line.name_ar : line.name;
                const optionsText = formatLineOptions(line.options, language);
                return (
                  <li className="py-3" key={cartLineKey(line)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black text-ink">{name}</p>
                        {optionsText ? <p className="text-xs text-stone-500">{optionsText}</p> : null}
                        <p className="mt-0.5 text-sm font-black text-stone-700">{money(line.price * line.quantity)}</p>
                      </div>
                      <div className="inline-flex shrink-0 items-center overflow-hidden rounded-full border border-stone-200 bg-stone-50">
                        <button
                          aria-label={`${copy.fewer} ${name}`}
                          className="focus-ring grid h-11 w-11 place-items-center text-stone-700"
                          onClick={() => cart.decrement(cartLineKey(line))}
                          type="button"
                        >
                          <Minus size={15} />
                        </button>
                        <span className="w-6 text-center text-sm font-black">{line.quantity}</span>
                        <button
                          aria-label={`${copy.more} ${name}`}
                          className="focus-ring grid h-11 w-11 place-items-center text-stone-700"
                          onClick={() => {
                            const offer = offerFor(line);
                            if (offer) cart.incrementOffer(cartLineKey(line), offer);
                            else cart.increment(cartLineKey(line));
                          }}
                          type="button"
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 flex gap-4 text-xs font-black">
                      {line.options?.length ? (
                        <button
                          className="focus-ring inline-flex min-h-8 items-center gap-1 rounded text-leaf"
                          onClick={() => onEdit(line, offerFor(line))}
                          type="button"
                        >
                          <Pencil aria-hidden size={13} />
                          {copy.edit}
                        </button>
                      ) : null}
                      <button
                        className="focus-ring inline-flex min-h-8 items-center gap-1 rounded text-rose-700"
                        onClick={() => cart.removeLine(cartLineKey(line))}
                        type="button"
                      >
                        <Trash2 aria-hidden size={13} />
                        {copy.remove}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {lines.length > 0 ? (
            <button
              className="focus-ring mt-2 rounded text-xs font-black text-stone-500 underline underline-offset-2"
              onClick={() => {
                if (confirmingClear) {
                  cart.clearCart();
                  setConfirmingClear(false);
                } else {
                  setConfirmingClear(true);
                }
              }}
              type="button"
            >
              {confirmingClear ? copy.confirmClear : copy.clear}
            </button>
          ) : null}
        </div>

        <div className="border-t border-stone-100 bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          {amountRemaining > 0 && lines.length > 0 ? (
            <div className="mb-3">
              <p className="text-xs font-bold text-stone-600">
                {copy.minimum(money(amountRemaining), money(minimum))}
              </p>
              <div aria-hidden className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-leaf" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : null}
          <div className="mb-3 flex items-baseline justify-between text-sm">
            <span className="font-bold text-stone-600">{copy.subtotal}</span>
            <strong className="text-base font-black">{money(subtotal)}</strong>
          </div>
          {closedLabel ? (
            <p className="rounded-full bg-stone-100 px-4 py-3 text-center text-sm font-black text-stone-600">
              {closedLabel}
            </p>
          ) : canCheckout ? (
            <Link
              className="focus-ring inline-flex min-h-12 w-full items-center justify-center rounded-full bg-leaf px-5 py-3 font-black text-white"
              href={checkoutHref}
            >
              {copy.checkout} · {money(subtotal)}
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-stone-200 px-5 py-3 font-black text-stone-500"
            >
              {copy.checkout}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
