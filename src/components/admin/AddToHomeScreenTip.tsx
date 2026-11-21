import Link from "next/link";

// Shown once, right after a WhatsApp login: an icon on the home screen means
// the owner never has to find the login page again.
export function AddToHomeScreenTip() {
  return (
    <section className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-950">
      <h2 className="text-lg font-black">You&apos;re signed in. Add WhatsOrder to your home screen</h2>
      <p className="mt-1 text-base" dir="rtl" lang="ar">
        تم تسجيل الدخول. أضف WhatsOrder إلى الشاشة الرئيسية
      </p>
      <ul className="mt-3 space-y-1 text-base">
        <li>
          <strong>iPhone:</strong> tap Share, then &quot;Add to Home Screen&quot;.
        </li>
        <li>
          <strong>Android:</strong> tap the ⋮ menu, then &quot;Add to Home screen&quot; or &quot;Install app&quot;.
        </li>
      </ul>
      <p className="mt-2 text-sm text-emerald-900">You will stay signed in on this phone for 90 days.</p>
      <Link className="mt-3 inline-block text-sm font-bold underline" href="/admin">
        Got it
      </Link>
    </section>
  );
}
