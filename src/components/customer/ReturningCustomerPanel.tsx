"use client";

import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { formatAED } from "@/lib/currency";
import { useCart } from "@/components/customer/CartProvider";
import type { CustomerLanguage } from "@/lib/customer-i18n";
import type { CustomerLoyalty, CustomerRecentOrder } from "@/lib/customer-auth/context";
import type { CartLine } from "@/lib/types";

const MAX_STAMP_DOTS = 12;

function validLines(items: unknown): CartLine[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return (items as CartLine[]).filter(
    (line) => line && typeof line.item_id === "string" && Number(line.quantity) > 0
  );
}

function StampCard({ loyalty, isAr }: { loyalty: CustomerLoyalty; isAr: boolean }) {
  const required = loyalty.stamps_required ?? 0;
  const stamps = Math.max(0, loyalty.stamps);
  const rewardReady = required > 0 && stamps >= required;
  const reward = loyalty.reward ?? (isAr ? "مكافأة" : "reward");
  // Cap the rendered dots so a large card stays compact.
  const dots = Math.min(required, MAX_STAMP_DOTS);

  return (
    <div className="rounded-2xl border border-mint bg-mint/15 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-black text-leaf">
          {isAr ? "بطاقة الأختام" : "Your stamp card"}
        </h2>
        <span className="text-sm font-bold text-leaf">
          {stamps}/{required}
        </span>
      </div>

      {dots > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from({ length: dots }).map((_, index) => {
            const filled = index < stamps;
            return (
              <span
                aria-hidden
                className={`grid h-6 w-6 place-items-center rounded-full border text-leaf ${
                  filled ? "border-leaf bg-leaf text-white" : "border-leaf/40 bg-white"
                }`}
                key={index}
              >
                {filled ? <Check size={13} /> : null}
              </span>
            );
          })}
          {required > MAX_STAMP_DOTS ? (
            <span className="self-center text-xs font-bold text-leaf/70">
              +{required - MAX_STAMP_DOTS}
            </span>
          ) : null}
        </div>
      ) : null}

      <p className="mt-3 text-sm font-semibold text-stone-700">
        {rewardReady
          ? isAr
            ? `🎉 لديك ${reward} مجاناً! اذكرها عند الطلب.`
            : `🎉 You've earned a free ${reward}! Mention it when you order.`
          : isAr
            ? `${Math.max(required - stamps, 0)} أختام أخرى للحصول على ${reward} مجاناً.`
            : `${Math.max(required - stamps, 0)} more to a free ${reward}.`}
      </p>
    </div>
  );
}

function ReorderStrip({
  orders,
  isAr
}: {
  orders: CustomerRecentOrder[];
  isAr: boolean;
}) {
  const cart = useCart();
  const [addedId, setAddedId] = useState<string | null>(null);

  const reorderable = orders
    .map((order) => ({ order, lines: validLines(order.items) }))
    .filter((entry) => entry.lines.length > 0);

  if (reorderable.length === 0) {
    return null;
  }

  return (
    <div>
      <h2 className="text-sm font-black text-ink">
        {isAr ? "اطلب مجدداً" : "Order again"}
      </h2>
      <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
        {reorderable.map(({ order, lines }) => {
          const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
          const justAdded = addedId === order.id;

          return (
            <div
              className="flex min-w-56 shrink-0 flex-col justify-between rounded-2xl border border-stone-200 bg-white p-3"
              key={order.id}
            >
              <p className="line-clamp-2 text-sm font-bold text-ink">
                {lines.map((line) => `${line.quantity}× ${line.name}`).join(", ")}
              </p>
              <p className="mt-1 text-xs font-semibold text-stone-500">
                {itemCount} {isAr ? "صنف" : itemCount === 1 ? "item" : "items"} ·{" "}
                {formatAED(order.total)}
              </p>
              <button
                className="focus-ring mt-3 inline-flex items-center justify-center gap-2 rounded-full bg-leaf px-3 py-2 text-sm font-black text-white transition disabled:opacity-70"
                onClick={() => {
                  cart.addLines(lines);
                  setAddedId(order.id);
                  window.setTimeout(() => setAddedId((id) => (id === order.id ? null : id)), 1800);
                }}
                type="button"
              >
                {justAdded ? <Check size={15} /> : <RotateCcw size={15} />}
                {justAdded
                  ? isAr
                    ? "تمت الإضافة"
                    : "Added"
                  : isAr
                    ? "أضف للسلة"
                    : "Add to cart"}
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
  language
}: {
  loyalty: CustomerLoyalty | null;
  recentOrders: CustomerRecentOrder[];
  language: CustomerLanguage;
}) {
  const isAr = language === "ar";
  const showLoyalty = Boolean(loyalty?.enabled && (loyalty?.stamps_required ?? 0) > 0);
  const hasReorder = recentOrders.some((order) => validLines(order.items).length > 0);

  if (!showLoyalty && !hasReorder) {
    return null;
  }

  return (
    <section className="mt-5 space-y-4 px-4" dir={isAr ? "rtl" : "ltr"}>
      {showLoyalty && loyalty ? <StampCard isAr={isAr} loyalty={loyalty} /> : null}
      {hasReorder ? <ReorderStrip isAr={isAr} orders={recentOrders} /> : null}
    </section>
  );
}
