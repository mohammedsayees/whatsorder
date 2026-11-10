"use client";

import { useActionState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  changeOrderPaymentMethodAction,
  type ChangePaymentState
} from "@/app/admin/orders/actions";
import type { CountryCode, PaymentMethod } from "@/lib/types";

const initialState: ChangePaymentState = {};

function label(method: PaymentMethod | string | null) {
  return method === "Cash on Delivery"
    ? "Cash"
    : method === "UPI"
      ? "UPI"
      : method === "Customer Credit"
        ? "Customer credit"
        : "Card";
}

export function PaymentMethodControl({
  orderId,
  paymentMethod,
  change,
  countryCode
}: {
  orderId: string;
  paymentMethod: PaymentMethod;
  countryCode?: CountryCode;
  change?: { from: string | null; to: string; role: string | null } | null;
}) {
  const [state, action, pending] = useActionState(
    changeOrderPaymentMethodAction,
    initialState
  );
  const paymentMethods: PaymentMethod[] = [
    "Cash on Delivery",
    "Card on Delivery",
    ...(countryCode === "IN" ? (["UPI"] as const) : [])
  ];

  if (paymentMethod === "Customer Credit") {
    return (
      <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-2.5">
        <p className="text-sm font-bold text-blue-800">Paid by customer credit</p>
        <p className="mt-1 text-xs text-blue-700">
          Payments and write-offs are managed from the customer credit ledger.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-stone-100 p-2.5">
      <form action={action}>
        <input name="order_id" type="hidden" value={orderId} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-bold text-stone-600">
            Paid: {label(paymentMethod)}
          </span>
          <select
            aria-label="Correct payment method"
            className="focus-ring rounded-lg border border-stone-200 px-2 py-1.5 text-xs font-black text-stone-600"
            defaultValue={paymentMethod}
            disabled={pending}
            name="payment_method"
          >
            {paymentMethods.map((method) => (
              <option key={method} value={method}>
                {label(method)}
              </option>
            ))}
          </select>
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
            Save method
          </button>
        </div>
      </form>
      {state.error ? (
        <p className="mt-1 text-xs font-bold text-rose-700">{state.error}</p>
      ) : null}
      {change ? (
        <p className="mt-1 text-xs font-semibold text-amber-700">
          Changed {label(change.from)} → {label(change.to)}
          {change.role ? ` by ${change.role.replace("_", " ")}` : ""}
        </p>
      ) : null}
    </div>
  );
}
