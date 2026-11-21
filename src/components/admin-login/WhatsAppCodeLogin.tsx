import {
  changeOwnerWhatsAppNumberAction,
  requestOwnerWhatsAppCodeAction,
  resendOwnerWhatsAppCodeAction,
  verifyOwnerWhatsAppCodeAction
} from "@/app/admin-login/actions";
import { maskPhone } from "@/lib/owner-whatsapp-login/phone";
import { PendingButton, ResendCodeButton } from "./WhatsAppCodeButtons";

// Plain words, English then Arabic, one action per screen. No CAPTCHA.
export const WHATSAPP_LOGIN_ERRORS: Record<string, { en: string; ar: string }> = {
  invalid_phone: {
    en: "That doesn't look like a phone number. Try again, for example 050 123 4567.",
    ar: "هذا لا يبدو رقم هاتف. حاول مرة أخرى، مثلاً 050 123 4567."
  },
  rate_limited: {
    en: "Too many tries from this device. Wait an hour, or sign in with email.",
    ar: "محاولات كثيرة من هذا الجهاز. انتظر ساعة أو سجّل الدخول بالبريد الإلكتروني."
  },
  unavailable: {
    en: "WhatsApp login isn't available right now. Sign in with email, or call WhatsOrder support.",
    ar: "الدخول عبر واتساب غير متاح الآن. سجّل الدخول بالبريد الإلكتروني أو اتصل بدعم WhatsOrder."
  },
  wrong_code: {
    en: "That code didn't match. Try again or tap Resend.",
    ar: "الرمز غير صحيح. حاول مرة أخرى أو اضغط إعادة الإرسال."
  },
  expired: {
    en: "This code has expired or had too many wrong tries. Tap Resend for a new one.",
    ar: "انتهت صلاحية الرمز أو تم إدخاله خطأً عدة مرات. اضغط إعادة الإرسال للحصول على رمز جديد."
  }
};

function ErrorNote({ code }: { code?: string }) {
  const message = code ? WHATSAPP_LOGIN_ERRORS[code] : undefined;
  if (!message) {
    return null;
  }
  return (
    <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-base font-bold text-rose-700" role="alert">
      <p>{message.en}</p>
      <p className="mt-1" dir="rtl" lang="ar">
        {message.ar}
      </p>
    </div>
  );
}

export function WhatsAppPhoneForm({ error }: { error?: string }) {
  return (
    <>
      <ErrorNote code={error} />
      <form action={requestOwnerWhatsAppCodeAction} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-base font-bold">Your WhatsApp number</span>
          <span className="block text-base font-bold" dir="rtl" lang="ar">
            رقم واتساب الخاص بك
          </span>
          <input
            autoComplete="tel"
            className="focus-ring mt-2 w-full rounded-lg border border-stone-300 px-4 py-4 text-xl tracking-wide"
            dir="ltr"
            inputMode="tel"
            name="phone"
            placeholder="050 123 4567"
            required
            type="tel"
          />
        </label>
        <PendingButton pendingLabel="Sending… / جارٍ الإرسال…">
          Send code on WhatsApp / أرسل الرمز عبر واتساب
        </PendingButton>
      </form>
      <p className="mt-4 text-sm leading-6 text-stone-500">
        If this number is registered with WhatsOrder, you will get a 6-digit code on WhatsApp.
      </p>
    </>
  );
}

export function WhatsAppCodeForm({
  phoneE164,
  resendInSeconds,
  error
}: {
  phoneE164: string;
  resendInSeconds: number;
  error?: string;
}) {
  return (
    <>
      <p className="mt-4 text-base leading-7 text-stone-700">
        If <strong dir="ltr">{maskPhone(phoneE164)}</strong> is registered, a 6-digit code is on its
        way on WhatsApp.
      </p>
      <p className="text-base leading-7 text-stone-700" dir="rtl" lang="ar">
        إذا كان الرقم مسجلاً، سيصلك رمز من 6 أرقام عبر واتساب.
      </p>
      <ErrorNote code={error} />
      <form action={verifyOwnerWhatsAppCodeAction} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-base font-bold">Code / الرمز</span>
          <input
            autoComplete="one-time-code"
            autoFocus
            className="focus-ring mt-2 w-full rounded-lg border border-stone-300 px-4 py-4 text-center text-3xl font-black tracking-[0.5em]"
            dir="ltr"
            inputMode="numeric"
            maxLength={6}
            minLength={6}
            name="code"
            pattern="[0-9]{6}"
            placeholder="••••••"
            required
          />
        </label>
        <PendingButton pendingLabel="Checking… / جارٍ التحقق…">Sign in / دخول</PendingButton>
      </form>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <form action={resendOwnerWhatsAppCodeAction}>
          <ResendCodeButton initialSeconds={resendInSeconds} />
        </form>
        <form action={changeOwnerWhatsAppNumberAction}>
          <button className="focus-ring rounded-lg px-3 py-2 text-base font-bold text-stone-600 underline" type="submit">
            Wrong number? / رقم خاطئ؟
          </button>
        </form>
      </div>
      <p className="mt-5 text-sm leading-6 text-stone-500">
        Didn&apos;t get it after a minute? Call WhatsOrder support and we will help you sign in.
      </p>
    </>
  );
}
