"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Gift, Loader2, MessageCircle, Stamp } from "lucide-react";
import {
  claimStampAction,
  type StampClaimResult
} from "@/app/r/[restaurantSlug]/stamp/actions";
import { pendingStampClaimKey } from "@/lib/customer-auth/stamp-claim";
import { useCustomerLanguage } from "@/components/customer/useCustomerLanguage";

type Translate = (en: string, ar: string) => string;

/** One sentence describing a claim result, in the customer's language. */
export function stampClaimText(result: StampClaimResult, t: Translate): string {
  if (!result.ok) {
    switch (result.error) {
      case "already_claimed":
        return t("This receipt's stamp has already been collected.", "تم جمع ختم هذا الإيصال بالفعل.");
      case "expired":
        return t("This receipt is more than 24 hours old, so its stamp can't be collected.", "مضى أكثر من 24 ساعة على هذا الإيصال، لذا لا يمكن جمع الختم.");
      case "order_cancelled":
        return t("This order was cancelled, so it has no stamp.", "تم إلغاء هذا الطلب، لذا لا يوجد ختم.");
      case "loyalty_off":
        return t("This café isn't giving stamps right now.", "هذا المقهى لا يقدم أختاماً حالياً.");
      case "invalid_link":
        return t("This stamp link isn't valid. Ask the café for help.", "رابط الختم هذا غير صالح. اطلب المساعدة من المقهى.");
      case "signed_out":
        return t("Please confirm your number on WhatsApp first.", "يرجى تأكيد رقمك عبر واتساب أولاً.");
      default:
        return t("Something went wrong. Please try again.", "حدث خطأ. يرجى المحاولة مرة أخرى.");
    }
  }
  const reward = result.reward?.trim() || t("reward", "مكافأة");
  const progress =
    result.required > 0
      ? result.stamps >= result.required
        ? t(`You have ${result.stamps}/${result.required}: your free ${reward} is ready!`, `لديك ${result.stamps}/${result.required}: ${reward} المجاني جاهز!`)
        : t(
            `${result.stamps}/${result.required} stamps · ${result.required - result.stamps} more for a free ${reward}.`,
            `${result.stamps}/${result.required} أختام · ${result.required - result.stamps} أخرى للحصول على ${reward} مجاناً.`
          )
      : "";
  switch (result.outcome) {
    case "stamped":
      return `${t("Stamp added!", "تمت إضافة الختم!")} ${progress}`;
    case "already":
      return `${t("You've already collected this stamp.", "لقد جمعت هذا الختم بالفعل.")} ${progress}`;
    case "pending":
      return t("Done! Your stamp is added as soon as your order is ready.", "تم! ستتم إضافة الختم عند تجهيز طلبك.");
    default:
      return t("Your number is saved. This order was below the minimum for a stamp.", "تم حفظ رقمك. هذا الطلب أقل من الحد الأدنى للحصول على ختم.");
  }
}

export function StampClaim({
  restaurantName,
  restaurantSlug,
  signedIn,
  signInUrl,
  token
}: {
  restaurantName: string;
  restaurantSlug: string;
  signedIn: boolean;
  signInUrl: string | null;
  token: string | null;
}) {
  const { language } = useCustomerLanguage();
  const isAr = language === "ar";
  const t: Translate = (en, ar) => (isAr ? ar : en);
  const [result, setResult] = useState<StampClaimResult | null>(null);
  const [pending, startTransition] = useTransition();

  // Signed out: keep the claim on this device; the account page finishes it
  // right after the WhatsApp sign-in link brings the customer back.
  useEffect(() => {
    if (!token || signedIn) return;
    try {
      window.localStorage.setItem(
        pendingStampClaimKey(restaurantSlug),
        JSON.stringify({ token, savedAt: Date.now() })
      );
    } catch {
      // Storage blocked: the customer can scan the receipt again after signing in.
    }
  }, [restaurantSlug, signedIn, token]);

  const card = "mx-auto mt-8 max-w-md rounded-2xl border border-stone-200 bg-white p-6 text-center";

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-6" dir={isAr ? "rtl" : "ltr"} lang={isAr ? "ar" : "en"}>
      <section className={card}>
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-mint text-leaf">
          <Stamp size={24} />
        </div>
        <h1 className="mt-3 text-xl font-black text-ink">{t("Collect your stamp", "اجمع ختمك")}</h1>
        <p className="text-sm font-semibold text-stone-500">{restaurantName}</p>

        {!token ? (
          <p className="mt-4 text-sm font-bold text-rose-700">
            {stampClaimText({ ok: false, error: "invalid_link" }, t)}
          </p>
        ) : result ? (
          <p
            className={`mt-4 rounded-xl px-4 py-3 text-sm font-black ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}
            role="status"
          >
            {result.ok && result.stamps >= result.required && result.required > 0 ? (
              <Gift className="mb-1 inline" size={16} />
            ) : null}{" "}
            {stampClaimText(result, t)}
          </p>
        ) : signedIn ? (
          <button
            className="focus-ring mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-leaf px-5 py-3 text-sm font-black text-white disabled:opacity-60"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setResult(await claimStampAction(restaurantSlug, token));
              })
            }
            type="button"
          >
            {pending ? <Loader2 className="animate-spin" size={16} /> : <Stamp size={16} />}
            {t("Add my stamp", "أضف ختمي")}
          </button>
        ) : signInUrl ? (
          <>
            <p className="mt-4 text-sm font-semibold text-stone-600">
              {t(
                "Confirm your number on WhatsApp: press send on the message we open, then tap the link we reply with. Your stamp is added automatically.",
                "أكّد رقمك عبر واتساب: اضغط إرسال على الرسالة، ثم افتح الرابط الذي نرسله. ستتم إضافة الختم تلقائياً."
              )}
            </p>
            <a
              className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-leaf px-5 py-3 text-sm font-black text-white"
              href={signInUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              <MessageCircle size={16} />
              {t("Confirm with WhatsApp", "التأكيد عبر واتساب")}
            </a>
          </>
        ) : (
          <p className="mt-4 text-sm font-semibold text-stone-600">
            {t(
              "Ask the café to add your number to your order to collect the stamp.",
              "اطلب من المقهى إضافة رقمك إلى طلبك لجمع الختم."
            )}
          </p>
        )}

        <Link className="focus-ring mt-5 inline-block text-sm font-black text-leaf underline-offset-4 hover:underline" href={`/r/${restaurantSlug}`}>
          {t("See the menu", "عرض القائمة")}
        </Link>
      </section>
    </main>
  );
}

/**
 * Finishes a receipt claim saved before the customer signed in. Mounted on
 * the account page (where the WhatsApp sign-in link lands); renders nothing
 * when there is no pending claim.
 */
export function PendingStampClaim({ restaurantSlug, t }: { restaurantSlug: string; t: Translate }) {
  const [result, setResult] = useState<StampClaimResult | null>(null);

  useEffect(() => {
    let token: string | null = null;
    try {
      const key = pendingStampClaimKey(restaurantSlug);
      const raw = window.localStorage.getItem(key);
      window.localStorage.removeItem(key);
      const saved = raw ? (JSON.parse(raw) as { token?: unknown; savedAt?: unknown }) : null;
      // The claim token itself expires in 24h; drop stale device copies sooner.
      if (
        saved &&
        typeof saved.token === "string" &&
        typeof saved.savedAt === "number" &&
        Date.now() - saved.savedAt < 24 * 60 * 60 * 1000
      ) {
        token = saved.token;
      }
    } catch {
      token = null;
    }
    if (!token) return;
    let active = true;
    void claimStampAction(restaurantSlug, token)
      .then((outcome) => {
        if (active) setResult(outcome);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [restaurantSlug]);

  if (!result) {
    return null;
  }
  return (
    <p
      className={`mt-4 rounded-2xl px-4 py-3 text-sm font-black ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
      role="status"
    >
      {stampClaimText(result, t)}
    </p>
  );
}
