"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Gift } from "lucide-react";
import { redeemReferralPointsAction } from "@/app/r/[restaurantSlug]/referral-actions";
import type { ReferralSummary } from "@/lib/referrals";

type Translate = (en: string, ar: string) => string;

export function CustomerReferralCard({
  money,
  referral,
  restaurantSlug,
  t
}: {
  money: (value: number | null | undefined) => string;
  referral: ReferralSummary;
  restaurantSlug: string;
  t: Translate;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const canRedeem = referral.balance >= referral.redeemPoints;
  const missing = Math.max(0, referral.redeemPoints - referral.balance);
  const progress = Math.min(100, Math.round((referral.balance / referral.redeemPoints) * 100));

  const redeem = () =>
    startTransition(async () => {
      const result = await redeemReferralPointsAction(restaurantSlug);
      if (result.ok) {
        setMessage(
          t(
            `Done! Your ${money(result.value)} voucher ${result.code} is below.`,
            `تم! قسيمتك بقيمة ${money(result.value)} (${result.code}) في الأسفل.`
          )
        );
        router.refresh();
      } else {
        setMessage(
          result.error === "not_enough_points"
            ? t("You don't have enough points yet.", "ليس لديك نقاط كافية بعد.")
            : t("Something went wrong. Please try again.", "حدث خطأ. حاول مرة أخرى.")
        );
      }
    });

  return (
    <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="flex items-center gap-2 text-base font-black text-ink">
        <Gift className="text-amber-700" size={20} />
        {t("Share & earn", "شارك واكسب")}
      </p>
      <p className="mt-1 text-sm font-semibold text-stone-600">
        {t(
          `Share this café with a friend. When their first order is complete, you both get ${referral.pointsEach} points.`,
          `شارك هذا المقهى مع صديق. عند اكتمال أول طلب له، تحصلان كلاكما على ${referral.pointsEach} نقطة.`
        )}
      </p>

      <p className="mt-3 text-2xl font-black text-ink">
        {referral.balance} <span className="text-sm font-bold text-stone-500">{t("points", "نقطة")}</span>
      </p>
      <div
        aria-hidden="true"
        className="mt-1 h-2 overflow-hidden rounded-full bg-amber-100"
      >
        <div className="h-full rounded-full bg-amber-500" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-1 text-xs font-semibold text-stone-500">
        {canRedeem
          ? t(
              `You can redeem ${referral.redeemPoints} points for ${money(referral.rewardValue)} off.`,
              `يمكنك استبدال ${referral.redeemPoints} نقطة بخصم ${money(referral.rewardValue)}.`
            )
          : t(
              `${missing} more points for ${money(referral.rewardValue)} off.`,
              `${missing} نقطة إضافية للحصول على خصم ${money(referral.rewardValue)}.`
            )}
      </p>

      {canRedeem ? (
        <button
          className="focus-ring mt-3 rounded-full bg-ink px-4 py-2 text-sm font-black text-white disabled:opacity-60"
          disabled={pending}
          onClick={redeem}
          type="button"
        >
          {t(`Get ${money(referral.rewardValue)} off`, `احصل على خصم ${money(referral.rewardValue)}`)}
        </button>
      ) : null}
      {message ? (
        <p className="mt-2 text-sm font-bold text-leaf" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
