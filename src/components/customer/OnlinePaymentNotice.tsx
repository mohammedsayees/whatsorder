import { CheckCircle2, CreditCard } from "lucide-react";
import type { OnlinePaymentStatus } from "@/lib/stripe/order-payment-rules";

// Server-rendered payment state for a "Pay online" order. No client JS: the
// customer returns from Stripe to a fresh render of this page.

export function OnlinePaymentNotice({
  status,
  payHref,
  returned,
  unavailable,
  arabic
}: {
  status: OnlinePaymentStatus | null;
  payHref: string;
  /** Customer just came back from Stripe Checkout (success URL). */
  returned: boolean;
  /** "Pay now" could not open a payment page. */
  unavailable: boolean;
  arabic: boolean;
}) {
  const t = (en: string, ar: string) => (arabic ? ar : en);

  if (!status) return null;

  if (status === "paid" || status === "refunded") {
    return (
      <div className="mt-5 flex items-center gap-3 rounded-2xl border border-leaf/30 bg-mint/50 px-4 py-3 text-start text-leaf">
        <CheckCircle2 className="shrink-0" size={22} />
        <p className="font-bold">
          {status === "paid"
            ? t("Paid online. Nothing to pay on collection.", "تم الدفع إلكترونياً. لا حاجة للدفع عند الاستلام.")
            : t("This online payment was refunded.", "تم استرداد هذا الدفع الإلكتروني.")}
        </p>
      </div>
    );
  }

  const confirming = status === "pending" && returned;
  const message = unavailable
    ? t("Online payment isn't available right now. You can pay when you collect.", "الدفع الإلكتروني غير متاح الآن. يمكنك الدفع عند الاستلام.")
    : confirming
      ? t("Confirming your payment… refresh in a few seconds.", "جارٍ تأكيد الدفع… حدّث الصفحة بعد ثوانٍ.")
      : status === "pending"
        ? t("Your order is saved but not paid yet.", "تم حفظ طلبك لكنه لم يُدفع بعد.")
        : t("The online payment didn't go through. Try again, or pay when you collect.", "لم يكتمل الدفع الإلكتروني. حاول مجدداً أو ادفع عند الاستلام.");

  return (
    <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-start text-amber-950">
      <p className="font-bold">{message}</p>
      {unavailable ? null : confirming ? (
        <a className="focus-ring mt-3 inline-flex w-full items-center justify-center rounded-full border border-amber-300 bg-white px-5 py-3 font-black" href="">
          {t("Refresh", "تحديث")}
        </a>
      ) : (
        <a className="focus-ring mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 font-black text-white" href={payHref}>
          <CreditCard size={18} />
          {status === "pending" ? t("Pay now", "ادفع الآن") : t("Try paying again", "حاول الدفع مجدداً")}
        </a>
      )}
    </div>
  );
}
