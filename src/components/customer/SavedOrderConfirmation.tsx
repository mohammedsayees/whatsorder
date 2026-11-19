import type { OrderConfirmation } from "@/lib/order-confirmation";
import { toOrderProgressSnapshot } from "@/lib/order-progress";
import type { PublicRestaurant } from "@/lib/types";
import Link from "next/link";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { buildWhatsAppUrl, normalizeCustomerPhone } from "@/lib/whatsapp";
import { formatCurrency } from "@/lib/currency";
import { formatOrderItemName } from "@/lib/cart-line";
import { InstallAppPrompt } from "@/components/customer/InstallAppPrompt";
import { OrderPushPrompt } from "@/components/customer/OrderPushPrompt";
import { OrderStatusTracker } from "@/components/customer/OrderStatusTracker";
import { TrackedWhatsAppLink } from "@/components/customer/TrackedWhatsAppLink";
import { onboardingOrdersHref } from "@/lib/onboarding-order-handoff";
import { OnlinePaymentNotice } from "@/components/customer/OnlinePaymentNotice";

export function SavedOrderConfirmation({ restaurant, order, language, onboardingTest = false, webPushPublicKey, prepMinutes = null, paymentReturn = null }: {
  restaurant: PublicRestaurant; order: OrderConfirmation; language?: string; onboardingTest?: boolean; webPushPublicKey: string | null;
  prepMinutes?: number | null;
  /** ?payment= from the Stripe return URL or the Pay now route. */
  paymentReturn?: string | null;
}) {
  const active = order.status !== "Cancelled" && order.status !== "Completed";
  const arabic = language === "ar";
  const t = (en: string, ar: string) => arabic ? ar : en;
  const reference = order.id.slice(-8).toUpperCase();
  const restaurantName = arabic && restaurant.name_ar ? restaurant.name_ar : restaurant.name;
  const whatsappUrl = buildWhatsAppUrl(restaurant.whatsapp_number,
    active ? order.whatsapp_message : `Hi, I need help with order #${reference}.`,
    restaurant.phone_country_code);
  const callNumber = restaurant.whatsapp_number
    ? normalizeCustomerPhone(restaurant.whatsapp_number, restaurant.phone_country_code)
    : "";
  const callHref = callNumber ? `tel:+${callNumber}` : null;
  const awaitingSend = order.status === "New";

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-8" dir={arabic ? "rtl" : "ltr"} lang={arabic ? "ar" : "en"}>
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-mint text-leaf">
          <CheckCircle2 size={30} />
        </div>
        <h1 className="mt-4 text-2xl font-black">
          {awaitingSend ? t("Order saved", "تم حفظ الطلب") : restaurantName}
        </h1>
        <p className="mt-2 leading-7 text-stone-600">
          {awaitingSend
            ? t(`Send it to ${restaurantName} on WhatsApp so they can confirm it.`, `أرسله إلى ${restaurantName} عبر واتساب ليؤكده.`)
            : t("Follow your order below.", "تابع طلبك أدناه.")}
        </p>
        <p className="mt-3 inline-flex rounded-full bg-stone-100 px-3 py-1 text-sm font-bold text-stone-700">
          {t("Reference", "رقم الطلب")}: {reference}
        </p>
      </div>

      {active || order.online_payment_status === "paid" ? (
        <OnlinePaymentNotice
          arabic={arabic}
          payHref={`/r/${restaurant.slug}/pay?order=${encodeURIComponent(order.id)}`}
          returned={paymentReturn === "done"}
          status={order.online_payment_status ?? null}
          unavailable={paymentReturn === "unavailable"}
        />
      ) : null}

      {onboardingTest ? (
        <aside className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4 text-start text-violet-950">
          <p className="font-black">Test order saved · Final step</p>
          <p className="mt-1 text-sm text-violet-900/75">
            Return to Orders and accept the highlighted test order to finish setup.
          </p>
          <Link
            className="focus-ring mt-3 inline-flex w-full items-center justify-center rounded-full bg-violet-700 px-5 py-3 font-black text-white"
            href={onboardingOrdersHref(order.id)}
          >
            Go to dashboard and accept order
          </Link>
        </aside>
      ) : null}

      {awaitingSend ? (
        <div className="mt-5 text-center">
          <TrackedWhatsAppLink className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-full bg-leaf px-5 py-4 font-black text-white"
            href={whatsappUrl} orderId={order.id} restaurantId={restaurant.id}>
            <MessageCircle size={18} />
            {t("Send this order on WhatsApp", "أرسل هذا الطلب عبر واتساب")}
          </TrackedWhatsAppLink>
          <p className="mt-2 text-xs text-stone-500">
            {t("Already sent it? No need to send again. You can reopen WhatsApp from this page any time.", "أرسلته بالفعل؟ لا حاجة لإرساله مجدداً. يمكنك فتح واتساب من هذه الصفحة في أي وقت.")}
          </p>
        </div>
      ) : null}

      <div className="mt-5">
        <OrderStatusTracker
          callHref={callHref}
          initial={toOrderProgressSnapshot(order)}
          language={arabic ? "ar" : "en"}
          orderId={order.id}
          prepMinutes={prepMinutes}
          restaurantId={restaurant.id}
          whatsappUrl={whatsappUrl}
        />
      </div>

      <section className="mt-5 rounded-2xl border border-stone-200 bg-white p-4">
        <ul className="divide-y divide-stone-100 text-start text-sm">
          {order.items.map((item, index) => (
            <li className="flex justify-between gap-4 py-2.5" key={index}>
              <span>{item.quantity} × {formatOrderItemName(item, arabic ? "ar" : "en")}</span>
              <span className="shrink-0 font-bold">{formatCurrency(item.price * item.quantity, restaurant)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex justify-between border-t border-stone-200 pt-3 text-base font-black">
          <span>{t("Total", "الإجمالي")}</span>
          <span>{formatCurrency(order.total, restaurant)}</span>
        </p>
      </section>

      <div className="mt-5 flex flex-col gap-3 text-center">
        {!awaitingSend ? (
          <a className="focus-ring inline-flex items-center justify-center gap-2 rounded-full border border-leaf px-5 py-3 font-black text-leaf"
            href={whatsappUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={18} />
            {active ? t("Message the restaurant on WhatsApp", "راسل المطعم عبر واتساب") : t("Contact restaurant about this order", "تواصل مع المطعم بشأن هذا الطلب")}
          </a>
        ) : null}
        {webPushPublicKey ? <OrderPushPrompt orderId={order.id} publicKey={webPushPublicKey}
          restaurantSlug={restaurant.slug} /> : null}
        <InstallAppPrompt language={arabic ? "ar" : "en"} />
        <Link className="focus-ring rounded-full border border-stone-200 px-5 py-3 font-bold text-ink"
          href={`/r/${restaurant.slug}`}>{t("Back to menu", "العودة إلى القائمة")}</Link>
      </div>
    </main>
  );
}
