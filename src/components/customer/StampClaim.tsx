"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Gift, Loader2, MessageCircle, RotateCcw, Stamp } from "lucide-react";
import { claimStampAction } from "@/app/r/[restaurantSlug]/stamp/actions";
import { pendingStampClaimKey } from "@/lib/customer-auth/stamp-claim";
import { stampClaimText, type StampClaimResult } from "@/lib/stamp-claim-text";
import { useCustomerLanguage } from "@/components/customer/useCustomerLanguage";

type Translate = (en: string, ar: string) => string;

/** Filled and empty stamp dots, like the menu and account pages. */
function StampDots({ stamps, required }: { stamps: number; required: number }) {
  const dots = Math.min(required, 12);
  if (dots <= 0) return null;
  return (
    <div aria-hidden className="mt-3 flex flex-wrap justify-center gap-1.5">
      {Array.from({ length: dots }).map((_, index) => (
        <span
          className={`grid h-7 w-7 place-items-center rounded-full border ${
            index < stamps ? "border-leaf bg-leaf text-white" : "border-leaf/40 bg-white"
          }`}
          key={index}
        >
          {index < stamps ? <Check size={14} /> : null}
        </span>
      ))}
    </div>
  );
}

export function StampClaim({
  expired = false,
  logoUrl = null,
  restaurantName,
  restaurantNameAr = null,
  restaurantSlug,
  signedIn,
  signInUrl,
  token
}: {
  /** A genuine receipt from this café, older than 24 hours. */
  expired?: boolean;
  logoUrl?: string | null;
  restaurantName: string;
  restaurantNameAr?: string | null;
  restaurantSlug: string;
  signedIn: boolean;
  signInUrl: string | null;
  token: string | null;
}) {
  const { language, setLanguage } = useCustomerLanguage();
  const isAr = language === "ar";
  const t: Translate = (en, ar) => (isAr ? ar : en);
  const name = isAr && restaurantNameAr ? restaurantNameAr : restaurantName;
  const [result, setResult] = useState<StampClaimResult | null>(null);
  const [pending, startTransition] = useTransition();
  const autoClaimed = useRef(false);

  function claim() {
    if (!token) return;
    startTransition(async () => {
      setResult(await claimStampAction(restaurantSlug, token));
    });
  }

  // Signed in: claiming is safe to repeat ("already collected"), so do it on
  // open instead of asking for another tap.
  useEffect(() => {
    if (!token || !signedIn || autoClaimed.current) return;
    autoClaimed.current = true;
    claim();
    // claim() only depends on the props checked above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, token]);

  // Signed out: also keep the claim on this device. The WhatsApp sign-in
  // message already carries it; this is the fallback for that path.
  useEffect(() => {
    if (!token || signedIn) return;
    try {
      window.localStorage.setItem(
        pendingStampClaimKey(restaurantSlug),
        JSON.stringify({ token, savedAt: Date.now() })
      );
    } catch {
      // Storage blocked: the WhatsApp message still carries the claim.
    }
  }, [restaurantSlug, signedIn, token]);

  const earned = result?.ok && result.required > 0;
  const ready = Boolean(result?.ok && result.required > 0 && result.stamps >= result.required);

  return (
    <main className="min-h-screen px-4 py-6" dir={isAr ? "rtl" : "ltr"} lang={isAr ? "ar" : "en"}>
      <div className="mx-auto flex max-w-md justify-end">
        <button
          aria-label={t("Switch to Arabic", "التبديل إلى الإنجليزية")}
          className="focus-ring grid h-9 w-9 place-items-center rounded-full border border-stone-200 bg-white text-sm font-black text-ink"
          lang={isAr ? "en" : "ar"}
          onClick={() => setLanguage(isAr ? "en" : "ar")}
          type="button"
        >
          {isAr ? "EN" : "ع"}
        </button>
      </div>
      <section className="mx-auto mt-4 max-w-md rounded-2xl border border-stone-200 bg-white p-6 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="mx-auto h-14 w-14 rounded-2xl object-cover" height={56} src={logoUrl} width={56} />
        ) : (
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-mint text-leaf">
            <Stamp size={24} />
          </div>
        )}
        <h1 className="mt-3 text-xl font-black text-ink">{t("Collect your stamp", "اجمع ختمك")}</h1>
        <p className="text-sm font-semibold text-stone-500">{name}</p>

        {expired ? (
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
            {stampClaimText({ ok: false, error: "expired" }, t)}
          </p>
        ) : !token ? (
          <p className="mt-4 text-sm font-bold text-rose-700">
            {stampClaimText({ ok: false, error: "invalid_link" }, t)}
          </p>
        ) : result ? (
          <>
            {earned && result.ok ? <StampDots required={result.required} stamps={result.stamps} /> : null}
            <p
              className={`mt-4 rounded-xl px-4 py-3 text-sm font-black ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}
              role="status"
            >
              {ready ? <Gift className="mb-1 inline" size={16} /> : null} {stampClaimText(result, t)}
            </p>
            {result.ok ? (
              <a
                className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-leaf px-5 py-3 text-sm font-black text-white"
                href={`/r/${restaurantSlug}/account`}
              >
                <Gift size={16} />
                {t("View my rewards", "عرض مكافآتي")}
              </a>
            ) : result.error === "failed" ? (
              <button
                className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-5 py-3 text-sm font-black text-ink disabled:opacity-60"
                disabled={pending}
                onClick={claim}
                type="button"
              >
                <RotateCcw size={16} />
                {t("Try again", "حاول مرة أخرى")}
              </button>
            ) : null}
          </>
        ) : signedIn ? (
          <p className="mt-5 inline-flex items-center justify-center gap-2 text-sm font-black text-leaf" role="status">
            <Loader2 className="animate-spin" size={16} />
            {t("Adding your stamp…", "جارٍ إضافة ختمك…")}
          </p>
        ) : signInUrl ? (
          <>
            <p className="mt-4 text-sm font-semibold text-stone-600">
              {t(
                "Confirm your number on WhatsApp: press send on the message we open. We add your stamp straight away and reply with a link to your rewards.",
                "أكّد رقمك عبر واتساب: اضغط إرسال على الرسالة التي نفتحها. نضيف ختمك فوراً ونرد عليك برابط مكافآتك."
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
