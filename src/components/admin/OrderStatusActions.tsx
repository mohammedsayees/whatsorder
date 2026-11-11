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
import type {
  CountryCode,
  CustomerCreditSummary,
  FulfilmentType,
  OrderStatus,
  PaymentMethod
} from "@/lib/types";

const basePaymentOptions: { label: string; value: PaymentMethod }[] = [
  { label: "Complete · Cash", value: "Cash on Delivery" },
  { label: "Complete · Card", value: "Card on Delivery" }
];

export function OrderStatusActions({
  fulfilmentType,
  credit,
  countryCode,
  orderId,
  orderTotal = 0,
  paymentMethod,
  status,
  showCancel = true
}: {
  fulfilmentType: FulfilmentType;
  credit?: CustomerCreditSummary;
  countryCode?: CountryCode;
  orderId: string;
  orderTotal?: number;
  paymentMethod: PaymentMethod | null;
  status: OrderStatus;
  showCancel?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submittingStatus, setSubmittingStatus] = useState<OrderStatus | null>(null);
  const [collecting, setCollecting] = useState<PaymentMethod | null>(null);
  const nextStatus = getNextOrderStatus(fulfilmentType, status);
  const cancellable = canCancelOrder(status);
  // An unpaid ticket (no payment method yet) must capture payment when it is
  // completed, so the final step asks how the customer paid.
  const completingNeedsPayment = nextStatus === "Completed" && paymentMethod === null;
  const busy = submittingStatus !== null || collecting !== null;
  const standardPaymentOptions =
    countryCode === "IN"
      ? [...basePaymentOptions, { label: "Complete · UPI", value: "UPI" as const }]
      : basePaymentOptions;
  const paymentOptions: Array<{
    label: string;
    value: PaymentMethod;
    disabled?: boolean;
  }> = [
    ...standardPaymentOptions,
    ...(credit?.account.is_enabled
      ? [
          {
            label: "Complete · Credit",
            value: "Customer Credit" as const,
            disabled: credit.available < orderTotal
          }
        ]
      : [])
  ];

  async function runAction(action: (data: FormData) => Promise<void>, data: FormData) {
    setError(null);
    try { await action(data); }
    catch { setError("The change could not be saved. Please retry."); }
    finally { setCollecting(null); setSubmittingStatus(null); }
  }

  if (!nextStatus && !cancellable) {
    return (
      <p className="mt-3 rounded-lg bg-stone-100 px-3 py-2 text-center text-sm font-bold text-stone-600">
        Order {status.toLowerCase()}
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
      {nextStatus && completingNeedsPayment ? (
        <details className="group rounded-lg bg-ink text-white">
          <summary className="focus-ring flex cursor-pointer list-none items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-black [&::-webkit-details-marker]:hidden">
            <CheckCircle2 size={17} />
            Complete & collect payment
          </summary>
          <div className="grid grid-cols-2 gap-2 border-t border-white/15 p-2 sm:grid-cols-3">
            {paymentOptions.map((option) => (
              <form
                action={(data) => runAction(collectPaymentAndCompleteAction, data)}
                key={option.value}
                onSubmit={() => setCollecting(option.value)}
              >
                <input name="order_id" type="hidden" value={orderId} />
                <input name="payment_method" type="hidden" value={option.value} />
                <button
                  className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-3 text-sm font-black text-ink disabled:opacity-60"
                  disabled={busy || option.disabled}
                  title={
                    option.disabled
                      ? "This order would exceed the customer's credit limit."
                      : undefined
                  }
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
          {credit?.account.is_enabled ? (
            <p className="px-3 pb-3 text-center text-xs font-semibold text-blue-100">
              Credit available: {countryCode === "IN" ? "INR" : "AED"} {credit.available.toFixed(2)}
              {credit.available < orderTotal ? " · Limit too low for this order" : ""}
            </p>
          ) : null}
        </details>
      ) : nextStatus ? (
        <form
          action={(data) => runAction(updateOrderStatusAction, data)}
          onSubmit={() => setSubmittingStatus(nextStatus)}
        >
          <input name="order_id" type="hidden" value={orderId} />
          <input name="status" type="hidden" value={nextStatus} />
          <button
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-black text-white disabled:opacity-60"
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

      {showCancel && cancellable ? <CancelOrderAction orderId={orderId} /> : null}
    </div>
  );
}

export function CancelOrderAction({ orderId }: { orderId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      className="mt-2"
      action={async (data) => {
        setError(null);
        try {
          await updateOrderStatusAction(data);
        } catch {
          setError("The order could not be cancelled. Please retry.");
        } finally {
          setSubmitting(false);
        }
      }}
      onSubmit={(event) => {
        const reason = window.prompt(
          "Why is this order being cancelled? This will be saved in the order history."
        );

        if (!reason?.trim()) {
          event.preventDefault();
          return;
        }

        const reasonInput = event.currentTarget.elements.namedItem("reason");
        if (reasonInput instanceof HTMLInputElement) reasonInput.value = reason.trim();
        setSubmitting(true);
      }}
    >
      <input name="order_id" type="hidden" value={orderId} />
      <input name="status" type="hidden" value="Cancelled" />
      <input name="reason" type="hidden" />
      <button
        className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 px-4 py-2.5 text-sm font-black text-rose-700 hover:bg-rose-50 disabled:opacity-60"
        disabled={submitting}
        type="submit"
      >
        {submitting ? <Loader2 className="animate-spin" size={16} /> : <XCircle size={16} />}
        Cancel order
      </button>
      {error ? <p className="mt-2 text-xs font-bold text-rose-700">{error}</p> : null}
    </form>
  );
}
