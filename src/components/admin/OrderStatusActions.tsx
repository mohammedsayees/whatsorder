"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { updateOrderStatusAction } from "@/app/actions";
import {
  canCancelOrder,
  getNextOrderActionLabel,
  getNextOrderStatus
} from "@/lib/order-status";
import type { FulfilmentType, OrderStatus } from "@/lib/types";

export function OrderStatusActions({
  fulfilmentType,
  orderId,
  status
}: {
  fulfilmentType: FulfilmentType;
  orderId: string;
  status: OrderStatus;
}) {
  const [submittingStatus, setSubmittingStatus] = useState<OrderStatus | null>(null);
  const nextStatus = getNextOrderStatus(fulfilmentType, status);
  const cancellable = canCancelOrder(status);

  if (!nextStatus && !cancellable) {
    return (
      <p className="mt-3 rounded-lg bg-stone-100 px-3 py-2 text-center text-sm font-bold text-stone-600">
        Order {status.toLowerCase()}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {nextStatus ? (
        <form
          action={updateOrderStatusAction}
          onSubmit={() => setSubmittingStatus(nextStatus)}
        >
          <input name="order_id" type="hidden" value={orderId} />
          <input name="status" type="hidden" value={nextStatus} />
          <button
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-black text-white disabled:opacity-60"
            disabled={submittingStatus !== null}
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
            disabled={submittingStatus !== null}
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
