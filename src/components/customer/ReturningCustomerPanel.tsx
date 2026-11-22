"use client";

import { useState } from "react";
import { Check, Gift, RotateCcw } from "lucide-react";
import { useCart } from "@/components/customer/CartProvider";
import { formatOrderItemName } from "@/lib/cart-line";
import { basketSignature } from "@/lib/customer-account";
import type { CustomerLanguage } from "@/lib/customer-i18n";
import { loyaltyRewardName } from "@/lib/loyalty-reward";
import type { CustomerLoyalty, CustomerRecentOrder } from "@/lib/customer-auth/context";
import type { CartLine } from "@/lib/types";

const MAX_REORDER_CARDS = 5;

function validLines(items: unknown): CartLine[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return (items as CartLine[]).filter(
    (line) => line && typeof line.item_id === "string" && Number(line.quantity) > 0
  );
}

/**
 * One-line stamp summary with a progress bar. The full stamp card lives on the
 * account page; here it must not push the menu off the first screen.
 */
function StampSummary({ loyalty, isAr }: { loyalty: CustomerLoyalty; isAr: boolean }) {
  const required = loyalty.stamps_required ?? 0;
  const stamps = Math.max(0, loyalty.stamps);
  const rewardReady = required > 0 && stamps >= required;
  const remaining = Math.max(required - stamps, 0);
  const name = loyaltyRewardName(loyalty.reward);
  const progress = required > 0 ? Math.min(100, Math.round((stamps / required) * 100)) : 0;

  const text = rewardReady
    ? isAr
      ? `🎉 ${name ?? "مكافأتك"} مجاناً جاهزة! اذكرها عند الطلب.`
      : `🎉 Your free ${name ?? "reward"} is ready! Mention it when you order.`
    : isAr
      ? `باقي ${remaining} لـ${name ?? "مكافأة"} مجاناً`
      : `${remaining} more to a free ${name ?? "reward"}`;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-leaf/15 bg-mint/50 px-4 py-3">
      <Gift aria-hidden className="shrink-0 text-leaf" size={18} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-ink">{text}</p>
        <div aria-hidden className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-leaf" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <span className="shrink-0 text-sm font-black text-leaf">
        <span className="sr-only">{isAr ? "الأختام" : "Stamps"} </span>
        {stamps}/{required}
      </span>
    </div>
  );
}

/** Recent orders as unique baskets (newest first), at most MAX_REORDER_CARDS. */
function uniqueBaskets(orders: CustomerRecentOrder[]) {
  const seen = new Set<string>();
  const baskets: { id: string; lines: CartLine[] }[] = [];
  for (const order of orders) {
    if (order.status === "Cancelled") continue;
    const lines = validLines(order.items);
    if (lines.length === 0) continue;
    const signature = basketSignature(lines);
    if (seen.has(signature)) continue;
    seen.add(signature);
    baskets.push({ id: order.id, lines });
    if (baskets.length === MAX_REORDER_CARDS) break;
  }
  return baskets;
}

function ReorderStrip({
  baskets,
  isAr,
  orderingAvailable
}: {
  baskets: { id: string; lines: CartLine[] }[];
  isAr: boolean;
  orderingAvailable: boolean;
}) {
  const cart = useCart();
  const [addedId, setAddedId] = useState<string | null>(null);
  const single = baskets.length === 1;

  return (
    <div>
      <h2 className="text-sm font-black text-ink">
        {isAr ? "اطلب مجدداً" : "Order again"}
      </h2>
      <div className={`mt-2 flex gap-3 pb-1 ${single ? "" : "overflow-x-auto"}`}>
        {baskets.map(({ id, lines }) => {
          const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
          const justAdded = addedId === id;

          return (
            <div
              className={`flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-3 ${
                single ? "w-full" : "w-64"
              }`}
              key={id}
            >
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-bold text-ink">
                  {lines
                    .map((line) => `${line.quantity}× ${formatOrderItemName(line, isAr ? "ar" : "en")}`)
                    .join(", ")}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-stone-500">
                  {isAr ? `${itemCount} صنف` : `${itemCount} ${itemCount === 1 ? "item" : "items"}`}
                </p>
              </div>
              <button
                className="focus-ring inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-leaf px-3 py-2 text-sm font-black text-white transition disabled:bg-stone-300"
                disabled={!orderingAvailable}
                onClick={() => {
                  cart.addLines(lines);
                  setAddedId(id);
                  window.setTimeout(() => setAddedId((current) => (current === id ? null : current)), 1800);
                }}
                type="button"
              >
                {justAdded ? <Check size={15} /> : <RotateCcw size={15} />}
                {justAdded ? (isAr ? "تمت الإضافة" : "Added") : isAr ? "أضف" : "Add"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Personalized strip shown above the menu for a signed-in returning customer:
 * their loyalty stamp card and a one-tap reorder of recent orders. Renders
 * nothing for cold opens or when there's nothing to show, so it's safe to mount
 * unconditionally.
 */
export function ReturningCustomerPanel({
  loyalty,
  recentOrders,
  language,
  orderingAvailable
}: {
  loyalty: CustomerLoyalty | null;
  recentOrders: CustomerRecentOrder[];
  language: CustomerLanguage;
  /** False while the café is closed: reorder buttons are disabled like the menu's. */
  orderingAvailable: boolean;
}) {
  const isAr = language === "ar";
  const showLoyalty = Boolean(loyalty?.enabled && (loyalty?.stamps_required ?? 0) > 0);
  const baskets = uniqueBaskets(recentOrders);

  if (!showLoyalty && baskets.length === 0) {
    return null;
  }

  return (
    <section className="mt-4 space-y-4 px-4" dir={isAr ? "rtl" : "ltr"}>
      {showLoyalty && loyalty ? <StampSummary isAr={isAr} loyalty={loyalty} /> : null}
      {baskets.length > 0 ? (
        <ReorderStrip baskets={baskets} isAr={isAr} orderingAvailable={orderingAvailable} />
      ) : null}
    </section>
  );
}
