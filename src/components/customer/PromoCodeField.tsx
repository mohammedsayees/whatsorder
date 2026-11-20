"use client";

import { useId, useState, useTransition } from "react";
import { Loader2, TicketPercent, X } from "lucide-react";
import { checkPromoCodeAction } from "@/app/r/[restaurantSlug]/checkout/actions";
import { formatCurrency } from "@/lib/currency";
import type { CustomerLanguage } from "@/lib/customer-i18n";
import { computePromoDiscount, describePromo, type PromoTerms } from "@/lib/promo-codes";
import type { CartLine, PublicRestaurant } from "@/lib/types";

const copy = {
  en: {
    toggle: "Have a promo code?",
    label: "Promo code",
    apply: "Apply",
    remove: "Remove promo code",
    belowMinimum: (amount: string) => `Add ${amount} more to use this code.`,
    failed: "The code could not be checked. Please try again."
  },
  ar: {
    toggle: "هل لديك رمز خصم؟",
    label: "رمز الخصم",
    apply: "تطبيق",
    remove: "إزالة رمز الخصم",
    belowMinimum: (amount: string) => `أضف ${amount} لاستخدام هذا الرمز.`,
    failed: "تعذر التحقق من الرمز. حاول مرة أخرى."
  }
} as const;

// "Have a promo code?" on the checkout summary. The server checks the code
// against trusted prices; the discount shown here is only a preview and is
// re-checked (with the customer's phone) when the order is sent.
export function PromoCodeField({
  applied,
  language,
  lines,
  onChange,
  restaurant,
  subtotal
}: {
  applied: PromoTerms | null;
  language: CustomerLanguage;
  lines: CartLine[];
  onChange: (terms: PromoTerms | null) => void;
  restaurant: PublicRestaurant;
  subtotal: number;
}) {
  const t = copy[language];
  const id = useId();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();

  if (applied) {
    const amount = computePromoDiscount(applied, subtotal);
    return (
      <div className="rounded-lg border border-leaf/30 bg-mint/60 px-3 py-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 font-black text-leaf">
            <TicketPercent className="shrink-0" size={16} />
            <span className="truncate">{applied.code}</span>
          </span>
          <button
            aria-label={t.remove}
            className="focus-ring rounded p-1 text-stone-500 hover:bg-white hover:text-ink"
            onClick={() => { onChange(null); setError(null); }}
            type="button"
          >
            <X size={15} />
          </button>
        </div>
        <p className="mt-0.5 text-xs font-semibold text-stone-600">
          {amount > 0
            ? describePromo(applied, (value) => formatCurrency(value, restaurant))
            : t.belowMinimum(formatCurrency(Math.max(applied.minSubtotal - subtotal, 0), restaurant))}
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        className="focus-ring inline-flex items-center gap-1.5 rounded px-1 text-sm font-bold text-leaf hover:underline"
        onClick={() => setOpen(true)}
        type="button"
      >
        <TicketPercent size={15} />
        {t.toggle}
      </button>
    );
  }

  function apply() {
    const trimmed = code.trim();
    if (!trimmed || checking) {
      return;
    }
    setError(null);
    startCheck(async () => {
      try {
        const result = await checkPromoCodeAction(restaurant.slug, trimmed, JSON.stringify(lines));
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onChange(result.terms);
        setCode("");
      } catch {
        setError(t.failed);
      }
    });
  }

  return (
    <div>
      <label className="sr-only" htmlFor={`${id}-code`}>{t.label}</label>
      <div className="flex gap-2">
        <input
          autoCapitalize="characters"
          autoComplete="off"
          className="focus-ring min-h-11 w-full min-w-0 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-bold uppercase tracking-wide"
          id={`${id}-code`}
          maxLength={24}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            }
          }}
          placeholder={t.label}
          spellCheck={false}
          value={code}
        />
        <button
          className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-4 text-sm font-black text-white disabled:opacity-50"
          disabled={checking || !code.trim()}
          onClick={apply}
          type="button"
        >
          {checking ? <Loader2 className="animate-spin" size={15} /> : null}
          {t.apply}
        </button>
      </div>
      {error ? <p className="mt-1.5 text-xs font-bold text-rose-700" role="alert">{error}</p> : null}
    </div>
  );
}
