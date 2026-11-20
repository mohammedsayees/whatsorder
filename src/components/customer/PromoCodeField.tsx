"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Loader2, TicketPercent, X } from "lucide-react";
import { checkPromoCodeAction } from "@/app/r/[restaurantSlug]/checkout/actions";
import { formatCurrency } from "@/lib/currency";
import type { CustomerLanguage } from "@/lib/customer-i18n";
import { computePromoDiscount, describePromo, type PromoTerms } from "@/lib/promo-codes";
import { describeVoucher, type CustomerVoucher } from "@/lib/customer-vouchers";
import type { CartLine, PublicRestaurant } from "@/lib/types";

const copy = {
  en: {
    toggle: "Have a promo code?",
    label: "Promo code",
    apply: "Apply",
    remove: "Remove promo code",
    belowMinimum: (amount: string) => `Add ${amount} more to use this code.`,
    failed: "The code could not be checked. Please try again.",
    yourVouchers: "Your vouchers"
  },
  ar: {
    toggle: "هل لديك رمز خصم؟",
    label: "رمز الخصم",
    apply: "تطبيق",
    remove: "إزالة رمز الخصم",
    belowMinimum: (amount: string) => `أضف ${amount} لاستخدام هذا الرمز.`,
    failed: "تعذر التحقق من الرمز. حاول مرة أخرى.",
    yourVouchers: "قسائمك"
  }
} as const;

// "Have a promo code?" on the checkout summary. The server checks the code
// against trusted prices; the discount shown here is only a preview and is
// re-checked (with the customer's phone) when the order is sent.
export function PromoCodeField({
  applied,
  initialCode = null,
  language,
  lines,
  onChange,
  restaurant,
  subtotal,
  vouchers = []
}: {
  applied: PromoTerms | null;
  /** Validated ?promo= from a voucher link: applied once on mount. */
  initialCode?: string | null;
  language: CustomerLanguage;
  lines: CartLine[];
  onChange: (terms: PromoTerms | null) => void;
  restaurant: PublicRestaurant;
  subtotal: number;
  /** Signed-in customer's usable vouchers, offered as one-tap chips. */
  vouchers?: CustomerVoucher[];
}) {
  const t = copy[language];
  const id = useId();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();
  const autoApplied = useRef(false);

  useEffect(() => {
    if (autoApplied.current || !initialCode || applied || lines.length === 0) {
      return;
    }
    autoApplied.current = true;
    setOpen(true);
    apply(initialCode);
    // Runs once, when the cart first has items.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode, lines.length]);

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

  const voucherChips =
    vouchers.length > 0 ? (
      <div className="mb-2">
        <p className="text-xs font-black text-stone-500">{t.yourVouchers}</p>
        <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
          {vouchers.map((voucher) => (
            <button
              className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-full border border-leaf/40 bg-mint/40 px-3 py-1.5 text-xs font-black text-leaf disabled:opacity-50"
              disabled={checking}
              key={voucher.code}
              onClick={() => apply(voucher.code)}
              type="button"
            >
              <TicketPercent size={13} />
              <span dir="ltr">{voucher.code}</span>
              <span className="font-semibold text-stone-600">
                · {describeVoucher(voucher, language, (value) => formatCurrency(value, restaurant))}
              </span>
            </button>
          ))}
        </div>
        {!open && error ? <p className="mt-1 text-xs font-bold text-rose-700" role="alert">{error}</p> : null}
      </div>
    ) : null;

  if (!open) {
    return (
      <div>
        {voucherChips}
        <button
          className="focus-ring inline-flex items-center gap-1.5 rounded px-1 text-sm font-bold text-leaf hover:underline"
          onClick={() => setOpen(true)}
          type="button"
        >
          <TicketPercent size={15} />
          {t.toggle}
        </button>
      </div>
    );
  }

  function apply(codeToApply?: string) {
    const trimmed = (codeToApply ?? code).trim();
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
      {voucherChips}
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
          onClick={() => apply()}
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
