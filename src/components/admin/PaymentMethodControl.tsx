"use client";

import { useActionState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  changeOrderPaymentMethodAction,
  type ChangePaymentState
} from "@/app/admin/orders/actions";
import type { PaymentMethod } from "@/lib/types";

const initialState: ChangePaymentState = {};

function label(method: PaymentMethod) {
  return method === "Cash on Delivery" ? "Cash" : "Card";
}

export function PaymentMethodControl({
  orderId,
  paymentMethod,
  change
}: {
  orderId: string;
  paymentMethod: PaymentMethod;
  change?: { from: string | null; to: string; role: string | null } | null;
}) {
  const [state, action, pending] = useActionState(
    changeOrderPaymentMethodAction,
    initialState
  );
  const otherMethod: PaymentMethod =
    paymentMethod === "Cash on Delivery" ? "Card on Delivery" : "Cash on Delivery";

  return (
    <div className="mt-2 rounded-lg border border-stone-100 p-2.5">
      <form action={action}>
        <input name="order_id" type="hidden" value={orderId} />
        <input name="payment_method" type="hidden" value={otherMethod} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-stone-600">
            Paid: {label(paymentMethod)}
          </span>
          <button
            className="focus-ring inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-black text-stone-600 hover:bg-stone-50 disabled:opacity-60"
            disabled={pending}
            type="submit"
          >
            {pending ? (
              <Loader2 className="animate-spin" size={13} />
            ) : (
              <RefreshCw size={13} />
            )}
            Switch to {label(otherMethod)}
          </button>
        </div>
      </form>
      {state.error ? (
        <p className="mt-1 text-xs font-bold text-rose-700">{state.error}</p>
      ) : null}
      {change ? (
        <p className="mt-1 text-xs font-semibold text-amber-700">
          Changed {change.from === "Cash on Delivery" ? "Cash" : "Card"} →{" "}
          {change.to === "Cash on Delivery" ? "Cash" : "Card"}
          {change.role ? ` by ${change.role.replace("_", " ")}` : ""}
        </p>
      ) : null}
    </div>
  );
}
