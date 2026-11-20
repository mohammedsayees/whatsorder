"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, TicketPercent } from "lucide-react";
import type { CustomerLanguage } from "@/lib/customer-i18n";
import {
  checkoutHrefForVoucher,
  describeVoucher,
  type CustomerVoucher
} from "@/lib/customer-vouchers";

type Translate = (en: string, ar: string) => string;

export function CustomerVouchers({
  formatDate,
  language,
  money,
  restaurantSlug,
  t,
  vouchers
}: {
  formatDate: (iso: string | null) => string;
  language: CustomerLanguage;
  money: (value: number | null | undefined) => string;
  restaurantSlug: string;
  t: Translate;
  vouchers: CustomerVoucher[];
}) {
  const [copied, setCopied] = useState<string | null>(null);

  if (vouchers.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm font-semibold text-stone-500">
        {t(
          "No vouchers right now. Offers from this café will show up here.",
          "لا توجد قسائم حالياً. ستظهر عروض هذا المقهى هنا."
        )}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {vouchers.map((voucher) => {
        const rules = [
          voucher.minSubtotal > 0
            ? t(`Min. order ${money(voucher.minSubtotal)}`, `الحد الأدنى للطلب ${money(voucher.minSubtotal)}`)
            : null,
          voucher.firstOrderOnly ? t("First order only", "للطلب الأول فقط") : null,
          voucher.usesLeft !== null
            ? voucher.usesLeft === 1
              ? t("1 use left", "استخدام واحد متبقٍ")
              : t(`${voucher.usesLeft} uses left`, `${voucher.usesLeft} استخدامات متبقية`)
            : null,
          voucher.endsAt ? t(`Until ${formatDate(voucher.endsAt)}`, `حتى ${formatDate(voucher.endsAt)}`) : null
        ].filter(Boolean);

        return (
          <li
            className="flex items-stretch overflow-hidden rounded-2xl border border-leaf/30 bg-white"
            key={voucher.code}
          >
            <div className="grid w-14 shrink-0 place-items-center bg-mint text-leaf">
              <TicketPercent size={22} />
            </div>
            <div className="min-w-0 flex-1 p-4">
              <p className="text-base font-black text-ink">
                {describeVoucher(voucher, language, (amount) => money(amount))}
              </p>
              <p className="mt-0.5 font-mono text-sm font-black tracking-wide text-leaf" dir="ltr">
                {voucher.code}
              </p>
              {rules.length > 0 ? (
                <p className="mt-1 text-xs font-semibold text-stone-500">{rules.join(" · ")}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-leaf px-4 py-2 text-sm font-black text-white"
                  href={checkoutHrefForVoucher(restaurantSlug, voucher.code)}
                >
                  {t("Use now", "استخدم الآن")}
                </Link>
                <button
                  className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-stone-200 px-3 py-2 text-xs font-black text-ink"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(voucher.code);
                      setCopied(voucher.code);
                      window.setTimeout(() => setCopied((current) => (current === voucher.code ? null : current)), 1800);
                    } catch {
                      // Clipboard blocked: the code is visible to copy by hand.
                    }
                  }}
                  type="button"
                >
                  {copied === voucher.code ? <Check size={13} /> : <Copy size={13} />}
                  {copied === voucher.code ? t("Copied", "تم النسخ") : t("Copy code", "نسخ الرمز")}
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
