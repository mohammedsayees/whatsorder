"use client";

import { useState, type ReactNode } from "react";
import { CheckCircle2, MessageCircle, Phone, XCircle } from "lucide-react";
import type { OrderConfirmation } from "@/lib/order-confirmation";
import { toOrderProgressSnapshot, isOrderActive } from "@/lib/order-progress";
import type { OrderStatus, PublicRestaurant } from "@/lib/types";
import { InstallAppPrompt } from "@/components/customer/InstallAppPrompt";
import { OrderPushPrompt } from "@/components/customer/OrderPushPrompt";
import { OrderStatusTracker } from "@/components/customer/OrderStatusTracker";
import { TrackedWhatsAppLink } from "@/components/customer/TrackedWhatsAppLink";

/**
 * The order confirmation page below the server-rendered payment notice. The
 * header, the WhatsApp actions and the push offer follow the status the
 * tracker polls, so a cancelled or accepted order never keeps saying
 * "Order saved, send it on WhatsApp".
 */
export function LiveOrderConfirmation({
  arabic,
  callHref,
  helpWhatsappUrl,
  languageHref,
  onboardingNotice,
  order,
  orderWhatsappUrl,
  paymentNotice,
  prepMinutes,
  receiptCard,
  restaurant,
  webPushPublicKey
}: {
  arabic: boolean;
  callHref: string | null;
  /** WhatsApp with "Hi, I need help with order #…" (not the order itself). */
  helpWhatsappUrl: string;
  /** This page in the other language. */
  languageHref: string;
  /** Server-rendered onboarding test-order hand-off, or null. */
  onboardingNotice: ReactNode;
  order: OrderConfirmation;
  /** WhatsApp with the full order message, for sending a new order. */
  orderWhatsappUrl: string;
  paymentNotice: ReactNode;
  prepMinutes: number | null;
  /** Server-rendered items, totals breakdown, fulfilment and payment. */
  receiptCard: ReactNode;
  restaurant: PublicRestaurant;
  webPushPublicKey: string | null;
}) {
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const t = (en: string, ar: string) => (arabic ? ar : en);
  const language = arabic ? "ar" : "en";
  const reference = order.id.slice(-8).toUpperCase();
  const restaurantName = arabic && restaurant.name_ar ? restaurant.name_ar : restaurant.name;
  const awaitingSend = status === "New";
  const cancelled = status === "Cancelled";
  const completed = status === "Completed";
  const active = isOrderActive(status);

  const heading = cancelled
    ? t("Order cancelled", "تم إلغاء الطلب")
    : awaitingSend
      ? t("Order saved", "تم حفظ الطلب")
      : completed
        ? t("Order completed", "اكتمل الطلب")
        : t("Order confirmed", "تم تأكيد الطلب");
  const subheading = cancelled
    ? t(
        `${restaurantName} cancelled this order. Contact them if you have questions.`,
        `ألغى ${restaurantName} هذا الطلب. تواصل معهم إذا كان لديك أي استفسار.`
      )
    : awaitingSend
      ? t(
          `Send it to ${restaurantName} on WhatsApp so they can confirm it.`,
          `أرسله إلى ${restaurantName} عبر واتساب ليؤكده.`
        )
      : completed
        ? t(`Thanks for ordering from ${restaurantName}.`, `شكراً لطلبك من ${restaurantName}.`)
        : t("Follow your order below.", "تابع طلبك أدناه.");

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-6" dir={arabic ? "rtl" : "ltr"} lang={language}>
      <div className="flex justify-end">
        <a
          aria-label={t("Switch to Arabic", "التبديل إلى الإنجليزية")}
          className="focus-ring grid h-9 w-9 place-items-center rounded-full border border-stone-200 bg-white text-sm font-black text-ink"
          href={languageHref}
          lang={arabic ? "en" : "ar"}
        >
          {arabic ? "EN" : "ع"}
        </a>
      </div>

      <div className="text-center">
        <div
          className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${
            cancelled ? "bg-rose-50 text-rose-700" : "bg-mint text-leaf"
          }`}
        >
          {cancelled ? <XCircle size={30} /> : <CheckCircle2 size={30} />}
        </div>
        <h1 aria-live="polite" className="mt-4 text-2xl font-black">
          {heading}
        </h1>
        <p className="mt-2 leading-7 text-stone-600">{subheading}</p>
        <p className="mt-3 inline-flex rounded-full bg-stone-100 px-3 py-1 text-sm font-bold text-stone-700">
          {t("Reference", "رقم الطلب")}: {reference}
        </p>
      </div>

      {paymentNotice}

      {onboardingNotice}

      {awaitingSend ? (
        <div className="mt-5 text-center">
          <TrackedWhatsAppLink
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-full bg-leaf px-5 py-4 font-black text-white"
            href={orderWhatsappUrl}
            orderId={order.id}
            restaurantId={restaurant.id}
          >
            <MessageCircle size={18} />
            {t("Send this order on WhatsApp", "أرسل هذا الطلب عبر واتساب")}
          </TrackedWhatsAppLink>
          <p className="mt-2 text-xs text-stone-500">
            {t(
              "Already sent it? No need to send again. You can reopen WhatsApp from this page any time.",
              "أرسلته بالفعل؟ لا حاجة لإرساله مجدداً. يمكنك فتح واتساب من هذه الصفحة في أي وقت."
            )}
          </p>
        </div>
      ) : null}

      {cancelled ? (
        <div className="mt-5 flex flex-col gap-2">
          <a
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-leaf px-5 py-3.5 font-black text-white"
            href={helpWhatsappUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <MessageCircle size={18} />
            {t("Contact the restaurant", "تواصل مع المطعم")}
          </a>
          {callHref ? (
            <a
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-5 py-3 font-black text-ink"
              href={callHref}
            >
              <Phone size={17} />
              {t("Call restaurant", "اتصل بالمطعم")}
            </a>
          ) : null}
        </div>
      ) : (
        <div className="mt-5">
          <OrderStatusTracker
            callHref={callHref}
            initial={toOrderProgressSnapshot(order)}
            language={language}
            onStatusChange={setStatus}
            orderId={order.id}
            prepMinutes={prepMinutes}
            restaurantId={restaurant.id}
          />
        </div>
      )}

      {/* Updates only matter while the order is still moving. */}
      {active && webPushPublicKey ? (
        <OrderPushPrompt
          language={language}
          orderId={order.id}
          publicKey={webPushPublicKey}
          restaurantSlug={restaurant.slug}
        />
      ) : null}

      {receiptCard}

      <div className="mt-5 flex flex-col gap-3 text-center">
        {!awaitingSend && !cancelled ? (
          <a
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-full border border-leaf px-5 py-3 font-black text-leaf"
            href={helpWhatsappUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <MessageCircle size={18} />
            {active
              ? t("Message the restaurant", "راسل المطعم")
              : t("Contact restaurant about this order", "تواصل مع المطعم بشأن هذا الطلب")}
          </a>
        ) : null}
        <a
          className="focus-ring rounded-full bg-ink px-5 py-3 font-black text-white"
          href={`/r/${restaurant.slug}/account`}
        >
          {completed || cancelled ? t("My orders · Order again", "طلباتي · اطلب مجدداً") : t("My orders", "طلباتي")}
        </a>
        <InstallAppPrompt language={language} />
        <a
          className="focus-ring rounded-full border border-stone-200 px-5 py-3 font-bold text-ink"
          href={`/r/${restaurant.slug}`}
        >
          {t("Back to menu", "العودة إلى القائمة")}
        </a>
      </div>
    </main>
  );
}
