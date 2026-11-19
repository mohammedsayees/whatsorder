"use client";

import { useId } from "react";
import { formatCurrency } from "@/lib/currency";
import {
  computeDiscountAmount,
  DISCOUNT_REASON_MAX_LENGTH,
  exceedsDiscountLimit,
  type OrderDiscountType
} from "@/lib/order-discount";
import type { Restaurant } from "@/lib/types";

export type StaffDiscountDraft = {
  type: OrderDiscountType;
  value: string;
  reason: string;
};

const PERCENT_PRESETS = [5, 10, 15, 20, 50, 100];
const REASON_PRESETS = ["Staff meal", "Regular customer", "Complaint", "Promotion"];

export function discountFromDraft(draft: StaffDiscountDraft) {
  const value = Number(draft.value);
  return Number.isFinite(value) && value > 0 ? { type: draft.type, value } : null;
}

// Controlled discount editor shared by the punch screen and the order card.
// It only previews: the server recomputes the amount and enforces the limit.
export function StaffDiscountControl({
  disabled = false,
  draft,
  limitPercent,
  onChange,
  restaurant,
  subtotal
}: {
  disabled?: boolean;
  draft: StaffDiscountDraft;
  limitPercent: number | null;
  onChange: (next: StaffDiscountDraft) => void;
  restaurant: Pick<Restaurant, "currency_code" | "country_code">;
  subtotal: number;
}) {
  const id = useId();
  const amount = computeDiscountAmount(subtotal, discountFromDraft(draft));
  const overLimit = exceedsDiscountLimit(subtotal, amount, limitPercent);
  const currencyLabel = restaurant.currency_code ?? "AED";
  const presets = PERCENT_PRESETS.filter((preset) => limitPercent === null || preset <= limitPercent);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="inline-flex shrink-0 rounded-lg border-2 border-stone-300 bg-white p-0.5" role="group" aria-label="Discount type">
          {(["percent", "fixed"] as const).map((type) => (
            <button
              aria-pressed={draft.type === type}
              className={`focus-ring rounded-md px-3 py-2 text-sm font-black ${draft.type === type ? "bg-ink text-white" : "text-stone-600 hover:bg-stone-100"}`}
              disabled={disabled}
              key={type}
              onClick={() => onChange({ ...draft, type })}
              type="button"
            >
              {type === "percent" ? "%" : currencyLabel}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor={`${id}-value`}>Discount amount</label>
        <input
          className="focus-ring min-h-11 w-full min-w-0 rounded-lg border-2 border-stone-300 bg-white px-3 py-2 text-base font-bold"
          disabled={disabled}
          id={`${id}-value`}
          inputMode="decimal"
          max={draft.type === "percent" ? 100 : undefined}
          min={0}
          onChange={(event) => onChange({ ...draft, value: event.target.value })}
          placeholder={draft.type === "percent" ? "e.g. 10" : "e.g. 5.00"}
          step="0.01"
          type="number"
          value={draft.value}
        />
      </div>

      {draft.type === "percent" && presets.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <button
              className={`focus-ring rounded-full border px-3 py-1 text-xs font-black ${Number(draft.value) === preset ? "border-leaf bg-mint text-leaf" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}
              disabled={disabled}
              key={preset}
              onClick={() => onChange({ ...draft, value: String(preset) })}
              type="button"
            >
              {preset}%
            </button>
          ))}
        </div>
      ) : null}

      <div>
        <label className="block text-sm font-bold text-stone-700" htmlFor={`${id}-reason`}>
          Reason <span className="font-normal text-stone-400">(required)</span>
        </label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {REASON_PRESETS.map((reason) => (
            <button
              className={`focus-ring rounded-full border px-3 py-1 text-xs font-bold ${draft.reason === reason ? "border-leaf bg-mint text-leaf" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}
              disabled={disabled}
              key={reason}
              onClick={() => onChange({ ...draft, reason })}
              type="button"
            >
              {reason}
            </button>
          ))}
        </div>
        <input
          className="focus-ring mt-2 block min-h-11 w-full rounded-lg border-2 border-stone-300 bg-white px-3 py-2 text-sm"
          disabled={disabled}
          id={`${id}-reason`}
          maxLength={DISCOUNT_REASON_MAX_LENGTH}
          onChange={(event) => onChange({ ...draft, reason: event.target.value })}
          placeholder="Or type a reason"
          type="text"
          value={draft.reason}
        />
      </div>

      {amount > 0 ? (
        <p className={`rounded-lg px-3 py-2 text-xs font-bold ${overLimit ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"}`} role="status">
          {overLimit
            ? `Above your limit of ${limitPercent}%. Ask a manager to apply it.`
            : `−${formatCurrency(amount, restaurant)} off the items${draft.reason.trim() ? "" : " · add a reason"}`}
        </p>
      ) : limitPercent !== null ? (
        <p className="text-xs font-semibold text-stone-500">You can give up to {limitPercent}% off.</p>
      ) : null}
    </div>
  );
}
