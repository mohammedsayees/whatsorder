import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { WhatsOrderBrand } from "@/components/shared/WhatsOrderBrand";
import { parseOwnerLoginLinkToken } from "@/lib/owner-whatsapp-login/link-token";
import { AutoSubmitLoginForm } from "./AutoSubmitLoginForm";

// The token is in the path: never send it on as a referrer, never index it.
export const metadata: Metadata = {
  title: "Open your WhatsOrder dashboard",
  referrer: "no-referrer",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

export default async function OwnerWhatsAppLinkPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const parsed = parseOwnerLoginLinkToken(decodeURIComponent(token));

  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-stone-200 bg-white p-7 shadow-xl">
        <WhatsOrderBrand imageClassName="h-12 w-12" labelClassName="text-xl font-black text-ink" />
        {parsed ? (
          <>
            <h1 className="mt-6 text-2xl font-black">Opening your dashboard</h1>
            <p className="mt-2 text-base leading-7 text-stone-600">
              If nothing happens, tap the green button.
            </p>
            <p className="mt-1 text-base leading-7 text-stone-600" dir="rtl" lang="ar">
              إذا لم يحدث شيء، اضغط على الزر الأخضر.
            </p>
            <AutoSubmitLoginForm token={`${parsed.requestId}.${parsed.code}`} />
          </>
        ) : (
          <>
            <div className="mt-6 grid h-12 w-12 place-items-center rounded-lg bg-amber-50 text-amber-700">
              <MessageCircle size={23} />
            </div>
            <h1 className="mt-4 text-2xl font-black">This link has been used or has expired</h1>
            <p className="mt-2 text-base leading-7 text-stone-600">
              Each login link works once, for 10 minutes. Ask WhatsOrder to send you a new one on
              WhatsApp.
            </p>
            <p className="mt-2 text-base leading-7 text-stone-600" dir="rtl" lang="ar">
              كل رابط دخول يعمل مرة واحدة فقط لمدة 10 دقائق. اطلب من WhatsOrder إرسال رابط جديد عبر
              واتساب.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
