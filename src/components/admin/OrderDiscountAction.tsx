"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent, Loader2 } from "lucide-react";
import { applyOrderDiscountAction } from "@/app/admin/orders/actions";
import {
  StaffDiscountControl,
  discountFromDraft,
  type StaffDiscountDraft
} from "@/components/admin/StaffDiscountControl";
import { formatCurrency } from "@/lib/currency";
import { computeDiscountAmount, exceedsDiscountLimit } from "@/lib/order-discount";
import type { Order, Restaurant } from "@/lib/types";

// Settlement-time discount on an open, unpaid order (e.g. before "Complete
// & collect payment"). The database recomputes and limits the amount.
export function OrderDiscountAction({
  limitPercent,
  order,
  restaurant
}: {
  limitPercent: number | null;
  order: Pick<Order, "id" | "subtotal" | "discount_amount" | "discount_type" | "discount_value" | "discount_reason">;
  restaurant: Pick<Restaurant, "currency_code" | "country_code">;
}) {
  const router = useRouter();
  const subtotal = Number(order.subtotal);
  const hasDiscount = Number(order.discount_amount ?? 0) > 0;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<StaffDiscountDraft>({
    type: order.discount_type === "fixed" ? "fixed" : "percent",
    value: order.discount_value ? String(Number(order.discount_value)) : "",
    reason: order.discount_reason ?? ""
  });
  const amount = computeDiscountAmount(subtotal, discountFromDraft(draft));
  const blocked =
    amount <= 0 || !draft.reason.trim() || exceedsDiscountLimit(subtotal, amount, limitPercent);

  async function save(remove: boolean) {
    setSaving(true);
    setError(null);
    try {
      const result = await applyOrderDiscountAction(
        order.id,
        remove ? { remove: true } : { type: draft.type, value: draft.value, reason: draft.reason }
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      if (remove) setDraft({ type: draft.type, value: "", reason: "" });
      setOpen(false);
      router.refresh();
    } catch {
      setError("The discount could not be saved. Check your connection and retry.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        className="focus-ring mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-black text-leaf hover:bg-mint"
        onClick={() => setOpen(true)}
        type="button"
      >
        <BadgePercent size={14} />
        {hasDiscount ? "Change discount" : "Add discount"}
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
      <StaffDiscountControl
        disabled={saving}
        draft={draft}
        limitPercent={limitPercent}
        onChange={setDraft}
        restaurant={restaurant}
        subtotal={subtotal}
      />
      {error ? <p className="mt-2 text-xs font-bold text-rose-700" role="alert">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-leaf px-3 py-2 text-xs font-black text-white disabled:opacity-50"
          disabled={saving || blocked}
          onClick={() => void save(false)}
          type="button"
        >
          {saving ? <Loader2 className="animate-spin" size={14} /> : null}
          Apply{amount > 0 ? ` −${formatCurrency(amount, restaurant)}` : ""}
        </button>
        {hasDiscount ? (
          <button
            className="focus-ring rounded-lg border border-rose-200 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            disabled={saving}
            onClick={() => void save(true)}
            type="button"
          >
            Remove discount
          </button>
        ) : null}
        <button
          className="rounded-lg px-3 py-2 text-xs font-bold text-stone-500 hover:bg-white"
          disabled={saving}
          onClick={() => { setOpen(false); setError(null); }}
          type="button"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
