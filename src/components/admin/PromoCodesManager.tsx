"use client";

import { useActionState, useState, useTransition } from "react";
import { Eye, EyeOff, Loader2, Plus, TicketPercent, Trash2 } from "lucide-react";
import {
  createPromoCodeAction,
  deletePromoCodeAction,
  setPromoCodeActiveAction,
  setPromoCodeVisibilityAction,
  type PromoCodeActionState
} from "@/app/admin/marketing/promo-codes/actions";
import { formatCurrency } from "@/lib/currency";
import { formatRestaurantDate } from "@/lib/date-time";
import type { PromoCodeWithUsage } from "@/lib/promo-code-data";
import { describePromo } from "@/lib/promo-codes";
import type { Restaurant } from "@/lib/types";

type Status = { label: string; className: string };

function promoStatus(code: PromoCodeWithUsage, now: number): Status {
  if (!code.isActive) return { label: "Off", className: "bg-stone-100 text-stone-600" };
  if (code.endsAt && now > new Date(code.endsAt).getTime()) return { label: "Expired", className: "bg-stone-100 text-stone-600" };
  if (code.startsAt && now < new Date(code.startsAt).getTime()) return { label: "Scheduled", className: "bg-amber-50 text-amber-800" };
  if (code.maxRedemptions !== null && code.timesUsed >= code.maxRedemptions) return { label: "Used up", className: "bg-stone-100 text-stone-600" };
  return { label: "Live", className: "bg-emerald-50 text-emerald-800" };
}

const inputClass = "focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2";

export function PromoCodesManager({
  codes,
  restaurant
}: {
  codes: PromoCodeWithUsage[];
  restaurant: Restaurant;
}) {
  const [state, formAction, saving] = useActionState<PromoCodeActionState, FormData>(createPromoCodeAction, {});
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [rowMessage, setRowMessage] = useState<PromoCodeActionState | null>(null);
  const [rowPending, startRowAction] = useTransition();
  const money = (value: number) => formatCurrency(value, restaurant);
  // Fixed for this page view so status labels do not change while open.
  const [now] = useState(() => Date.now());

  function runRowAction(action: (data: FormData) => Promise<PromoCodeActionState>, data: FormData) {
    setRowMessage(null);
    startRowAction(async () => {
      try {
        setRowMessage(await action(data));
      } catch {
        setRowMessage({ error: "The change could not be saved. Please retry." });
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
      <form action={formAction} className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-2 font-black"><Plus size={17} /> New promo code</h2>
        <label className="block">
          <span className="text-sm font-bold">Code</span>
          <input autoCapitalize="characters" className={`${inputClass} font-bold uppercase tracking-wide`} maxLength={24} name="code" placeholder="SAVE10" required spellCheck={false} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-sm font-bold">Type</span>
            <select className={inputClass} name="discount_type" onChange={(event) => setDiscountType(event.target.value === "fixed" ? "fixed" : "percent")} value={discountType}>
              <option value="percent">% off</option>
              <option value="fixed">{restaurant.currency_code ?? "AED"} off</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold">{discountType === "percent" ? "Percent" : "Amount"}</span>
            <input className={inputClass} inputMode="decimal" max={discountType === "percent" ? 100 : undefined} min="0.01" name="discount_value" required step="0.01" type="number" />
          </label>
        </div>
        {discountType === "percent" ? (
          <label className="block">
            <span className="text-sm font-bold">Maximum discount <span className="font-normal text-stone-400">(optional)</span></span>
            <input className={inputClass} inputMode="decimal" min="0.01" name="max_discount" step="0.01" type="number" />
          </label>
        ) : null}
        <label className="block">
          <span className="text-sm font-bold">Minimum order <span className="font-normal text-stone-400">(items subtotal)</span></span>
          <input className={inputClass} defaultValue="0" inputMode="decimal" min="0" name="min_subtotal" step="0.01" type="number" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-sm font-bold">Starts</span>
            <input className={inputClass} name="starts_on" type="date" />
          </label>
          <label className="block">
            <span className="text-sm font-bold">Ends</span>
            <input className={inputClass} name="ends_on" type="date" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-sm font-bold">Total uses</span>
            <input className={inputClass} min="1" name="max_redemptions" placeholder="Unlimited" step="1" type="number" />
          </label>
          <label className="block">
            <span className="text-sm font-bold">Per customer</span>
            <input className={inputClass} defaultValue="1" min="1" name="max_redemptions_per_customer" placeholder="Unlimited" step="1" type="number" />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input className="h-4 w-4 accent-emerald-600" name="first_order_only" type="checkbox" />
          First order only (new customers)
        </label>
        <label className="flex items-start gap-2 text-sm font-bold">
          <input className="mt-0.5 h-4 w-4 accent-emerald-600" name="show_in_account" type="checkbox" />
          <span>
            Show to signed-in customers
            <span className="block text-xs font-normal text-stone-500">
              Listed on their account page and offered at checkout. Leave off for codes you share privately.
            </span>
          </span>
        </label>
        <label className="block">
          <span className="text-sm font-bold">Note <span className="font-normal text-stone-400">(only you see this)</span></span>
          <input className={inputClass} maxLength={200} name="description" placeholder="e.g. Instagram launch" />
        </label>
        {state.error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700" role="alert">{state.error}</p> : null}
        {state.success ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800" role="status">{state.success}</p> : null}
        <button className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg bg-leaf px-4 py-2.5 font-black text-white disabled:opacity-60" disabled={saving} type="submit">
          {saving ? <Loader2 className="animate-spin" size={16} /> : <TicketPercent size={16} />}
          Create code
        </button>
        <p className="text-xs text-stone-500">Blank limits mean unlimited. Cancelled orders don&apos;t use up a code.</p>
      </form>

      <section aria-label="Promo codes" className="space-y-2">
        {rowMessage?.error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700" role="alert">{rowMessage.error}</p> : null}
        {rowMessage?.success ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800" role="status">{rowMessage.success}</p> : null}
        {codes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white px-5 py-12 text-center">
            <p className="font-black">No promo codes yet</p>
            <p className="mt-1 text-sm text-stone-500">Create one and share it on Instagram, WhatsApp status or a poster.</p>
          </div>
        ) : (
          codes.map((code) => {
            const status = promoStatus(code, now);
            const rules = [
              code.minSubtotal > 0 ? `min. ${money(code.minSubtotal)}` : null,
              code.maxRedemptionsPerCustomer ? `${code.maxRedemptionsPerCustomer}× per customer` : null,
              code.firstOrderOnly ? "first order only" : null,
              code.startsAt ? `from ${formatRestaurantDate(code.startsAt, restaurant)}` : null,
              code.endsAt ? `until ${formatRestaurantDate(code.endsAt, restaurant)}` : null
            ].filter(Boolean);
            return (
              <article className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm" key={code.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-mono text-lg font-black tracking-wide">{code.code}</h3>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-black ${status.className}`}>{status.label}</span>
                      {code.showInAccount ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-black text-sky-800">
                          <Eye size={12} /> Shown to customers
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm font-bold text-leaf">{describePromo(code, money)}</p>
                    {rules.length > 0 ? <p className="mt-0.5 text-xs text-stone-500">{rules.join(" · ")}</p> : null}
                    {code.description ? <p className="mt-1 text-xs text-stone-500">{code.description}</p> : null}
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-black">
                      Used {code.timesUsed}{code.maxRedemptions ? ` / ${code.maxRedemptions}` : ""}
                    </p>
                    {code.totalDiscount > 0 ? <p className="text-xs text-stone-500">{money(code.totalDiscount)} given</p> : null}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={(data) => runRowAction(setPromoCodeActiveAction, data)}>
                    <input name="id" type="hidden" value={code.id} />
                    <input name="is_active" type="hidden" value={code.isActive ? "false" : "true"} />
                    <button className="focus-ring rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-black text-stone-700 hover:bg-stone-50 disabled:opacity-50" disabled={rowPending} type="submit">
                      {code.isActive ? "Turn off" : "Turn on"}
                    </button>
                  </form>
                  <form action={(data) => runRowAction(setPromoCodeVisibilityAction, data)}>
                    <input name="id" type="hidden" value={code.id} />
                    <input name="show_in_account" type="hidden" value={code.showInAccount ? "false" : "true"} />
                    <button className="focus-ring inline-flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-black text-stone-700 hover:bg-stone-50 disabled:opacity-50" disabled={rowPending} type="submit">
                      {code.showInAccount ? <EyeOff size={13} /> : <Eye size={13} />}
                      {code.showInAccount ? "Hide from customers" : "Show to customers"}
                    </button>
                  </form>
                  {code.timesUsed === 0 ? (
                    <form action={(data) => {
                      if (window.confirm(`Delete ${code.code}?`)) runRowAction(deletePromoCodeAction, data);
                    }}>
                      <input name="id" type="hidden" value={code.id} />
                      <button className="focus-ring inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-50 disabled:opacity-50" disabled={rowPending} type="submit">
                        <Trash2 size={13} /> Delete
                      </button>
                    </form>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
