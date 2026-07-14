"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { updateOrderStatusAction } from "@/app/actions";
import { collectPaymentAndCompleteAction } from "@/app/admin/orders/actions";
import {
  canCancelOrder,
  getNextOrderActionLabel,
  getNextOrderStatus
} from "@/lib/order-status";
import type { CountryCode, FulfilmentType, OrderStatus, PaymentMethod } from "@/lib/types";

const basePaymentOptions: { label: string; value: PaymentMethod }[] = [
  { label: "Complete · Cash", value: "Cash on Delivery" },
  { label: "Complete · Card", value: "Card on Delivery" }
];

export function OrderStatusActions({
  fulfilmentType,
  countryCode,
  orderId,
  paymentMethod,
  status
}: {
  fulfilmentType: FulfilmentType;
  countryCode?: CountryCode;
  orderId: string;
  paymentMethod: PaymentMethod | null;
  status: OrderStatus;
}) {
  const [submittingStatus, setSubmittingStatus] = useState<OrderStatus | null>(null);
  const [collecting, setCollecting] = useState<PaymentMethod | null>(null);
  const nextStatus = getNextOrderStatus(fulfilmentType, status);
  const cancellable = canCancelOrder(status);
  // An unpaid ticket (no payment method yet) must capture payment when it is
  // completed, so the final step asks how the customer paid.
  const completingNeedsPayment = nextStatus === "Completed" && paymentMethod === null;
  const busy = submittingStatus !== null || collecting !== null;
  const paymentOptions =
    countryCode === "IN"
      ? [...basePaymentOptions, { label: "Complete · UPI", value: "UPI" as const }]
      : basePaymentOptions;

  if (!nextStatus && !cancellable) {
    return (
      <p className="mt-3 rounded-lg bg-stone-100 px-3 py-2 text-center text-sm font-bold text-stone-600">
        Order {status.toLowerCase()}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {nextStatus && completingNeedsPayment ? (
        <div className="space-y-2">
          <p className="text-center text-xs font-bold text-stone-500">
            Collect payment to complete
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {paymentOptions.map((option) => (
              <form
                action={collectPaymentAndCompleteAction}
                key={option.value}
                onSubmit={() => setCollecting(option.value)}
              >
                <input name="order_id" type="hidden" value={orderId} />
                <input name="payment_method" type="hidden" value={option.value} />
                <button
                  className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-3 py-3 text-sm font-black text-white disabled:opacity-60"
                  disabled={busy}
                  type="submit"
                >
                  {collecting === option.value ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  {option.label}
                </button>
              </form>
            ))}
          </div>
        </div>
      ) : nextStatus ? (
        <form
          action={updateOrderStatusAction}
          onSubmit={() => setSubmittingStatus(nextStatus)}
        >
          <input name="order_id" type="hidden" value={orderId} />
          <input name="status" type="hidden" value={nextStatus} />
          <button
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-black text-white disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {submittingStatus === nextStatus ? (
              <Loader2 className="animate-spin" size={17} />
            ) : (
              <CheckCircle2 size={17} />
            )}
            {getNextOrderActionLabel(nextStatus)}
          </button>
        </form>
      ) : null}

      {cancellable ? (
        <form
          action={updateOrderStatusAction}
          onSubmit={(event) => {
            const reason = window.prompt(
              "Why is this order being cancelled? This will be saved in the order history."
            );

            if (!reason?.trim()) {
              event.preventDefault();
              return;
            }

            const reasonInput = event.currentTarget.elements.namedItem("reason");
            if (reasonInput instanceof HTMLInputElement) {
              reasonInput.value = reason.trim();
            }
            setSubmittingStatus("Cancelled");
          }}
        >
          <input name="order_id" type="hidden" value={orderId} />
          <input name="status" type="hidden" value="Cancelled" />
          <input name="reason" type="hidden" />
          <button
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 px-4 py-2.5 text-sm font-black text-rose-700 hover:bg-rose-50 disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {submittingStatus === "Cancelled" ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <XCircle size={16} />
            )}
            Cancel order
          </button>
        </form>
      ) : null}
    </div>
  );
}
