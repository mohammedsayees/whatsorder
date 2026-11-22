import type { OrderConfirmation } from "@/lib/order-confirmation";
import type { PublicRestaurant } from "@/lib/types";
import Link from "next/link";
import { buildWhatsAppUrl, normalizeCustomerPhone } from "@/lib/whatsapp";
import { LiveOrderConfirmation } from "@/components/customer/LiveOrderConfirmation";
import { OnlinePaymentNotice } from "@/components/customer/OnlinePaymentNotice";
import { onboardingOrdersHref } from "@/lib/onboarding-order-handoff";
import { CreditCard, MapPin, ReceiptText } from "lucide-react";
import { receiptBreakdown } from "@/lib/order-receipt";
import { paymentMethodKind } from "@/lib/customer-account";
import { formatCurrency } from "@/lib/currency";
import { formatOrderItemName } from "@/lib/cart-line";

export function SavedOrderConfirmation({ restaurant, order, language, onboardingTest = false, webPushPublicKey, prepMinutes = null, paymentReturn = null }: {
  restaurant: PublicRestaurant; order: OrderConfirmation; language?: string; onboardingTest?: boolean; webPushPublicKey: string | null;
  prepMinutes?: number | null;
  /** ?payment= from the Stripe return URL or the Pay now route. */
  paymentReturn?: string | null;
}) {
  const active = order.status !== "Cancelled" && order.status !== "Completed";
  const arabic = language === "ar";
  const reference = order.id.slice(-8).toUpperCase();
  // Both links are ready up front so the page can switch the moment the
  // polled status changes: the full order only while it still needs sending,
  // a help message once the restaurant has it (or cancelled it).
  const orderWhatsappUrl = buildWhatsAppUrl(restaurant.whatsapp_number, order.whatsapp_message, restaurant.phone_country_code);
  const helpWhatsappUrl = buildWhatsAppUrl(restaurant.whatsapp_number,
    `Hi, I need help with order #${reference}.`, restaurant.phone_country_code);
  const callNumber = restaurant.whatsapp_number
    ? normalizeCustomerPhone(restaurant.whatsapp_number, restaurant.phone_country_code)
    : "";
  const languageQuery = new URLSearchParams({ order: order.id, lang: arabic ? "en" : "ar" });

  return (
    <LiveOrderConfirmation
      arabic={arabic}
      callHref={callNumber ? `tel:+${callNumber}` : null}
      helpWhatsappUrl={helpWhatsappUrl}
      languageHref={`/r/${restaurant.slug}/thank-you?${languageQuery.toString()}`}
      onboardingNotice={onboardingTest ? (
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
      order={order}
      orderWhatsappUrl={orderWhatsappUrl}
      paymentNotice={active || order.online_payment_status === "paid" ? (
        <OnlinePaymentNotice
          arabic={arabic}
          payHref={`/r/${restaurant.slug}/pay?order=${encodeURIComponent(order.id)}`}
          returned={paymentReturn === "done"}
          status={order.online_payment_status ?? null}
          unavailable={paymentReturn === "unavailable"}
        />
      ) : null}
      prepMinutes={prepMinutes}
      receiptCard={<OrderReceiptCard arabic={arabic} order={order} restaurant={restaurant} />}
      restaurant={restaurant}
      webPushPublicKey={webPushPublicKey}
    />
  );
}

/**
 * Shown instead of a bare 404 when this browser can't open the order: the
 * link was opened on another device, in another browser, or after the 7-day
 * access window. Says nothing about whether the order exists.
 */
export function OrderConfirmationUnavailable({ restaurant, language }: {
  restaurant: PublicRestaurant; language?: string;
}) {
  const arabic = language === "ar";
  const t = (en: string, ar: string) => (arabic ? ar : en);
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10 text-center" dir={arabic ? "rtl" : "ltr"} lang={arabic ? "ar" : "en"}>
      <h1 className="text-2xl font-black">{t("We can't show this order here", "لا يمكننا عرض هذا الطلب هنا")}</h1>
      <p className="mt-3 leading-7 text-stone-600">
        {t(
          "Order pages open on the phone and browser you ordered with, for 7 days. Signed in? Your orders are in My account.",
          "تفتح صفحة الطلب على الهاتف والمتصفح اللذين طلبت منهما، لمدة 7 أيام. إذا كنت مسجلاً الدخول، تجد طلباتك في حسابي."
        )}
      </p>
      <Link className="focus-ring mt-6 inline-flex justify-center rounded-full bg-leaf px-5 py-3 font-black text-white"
        href={`/r/${restaurant.slug}/account`} prefetch={false}>
        {t("My account", "حسابي")}
      </Link>
      <Link className="focus-ring mt-3 inline-flex justify-center rounded-full border border-stone-200 bg-white px-5 py-3 font-bold text-ink"
        href={`/r/${restaurant.slug}`}>
        {t("Back to menu", "العودة إلى القائمة")}
      </Link>
    </main>
  );
}

/** Items, the totals breakdown, where the order goes and how it's paid. */
function OrderReceiptCard({ arabic, order, restaurant }: {
  arabic: boolean; order: OrderConfirmation; restaurant: PublicRestaurant;
}) {
  const t = (en: string, ar: string) => (arabic ? ar : en);
  const language = arabic ? "ar" : "en";
  const restaurantName = arabic && restaurant.name_ar ? restaurant.name_ar : restaurant.name;
  const money = (value: number) => formatCurrency(value, restaurant);
  const breakdown = receiptBreakdown(order.items, order.receipt ?? null);
  const receipt = order.receipt;
  const fulfilmentLine =
    order.fulfilment_type === "delivery"
      ? receipt?.delivery_address
        ? `${t("Delivery to", "توصيل إلى")} ${receipt.delivery_address}`
        : t("Delivery", "توصيل")
      : order.fulfilment_type === "car_pickup"
        ? `${t("Pickup at your car", "الاستلام في سيارتك")}${receipt?.car_plate_number ? ` · ${receipt.car_plate_number}` : ""}`
        : order.fulfilment_type === "dine_in"
          ? receipt?.table_number
            ? `${t("Table", "طاولة")} ${receipt.table_number}`
            : t("Dine in", "داخل المطعم")
          : order.fulfilment_type === "takeaway"
            ? `${t("Pickup at", "الاستلام من")} ${restaurant.address || restaurantName}`
            : null;
  const onDelivery = order.fulfilment_type === "delivery";
  const methodKind = paymentMethodKind(receipt?.payment_method);
  const paymentLine =
    methodKind === "cash"
      ? onDelivery
        ? t("Cash on delivery", "نقداً عند التوصيل")
        : t("Cash on collection", "نقداً عند الاستلام")
      : methodKind === "card"
        ? onDelivery
          ? t("Card on delivery", "بطاقة عند التوصيل")
          : t("Card on collection", "بطاقة عند الاستلام")
        : methodKind === "online"
          ? t("Online payment", "دفع إلكتروني")
          : methodKind === "upi"
            ? "UPI"
            : methodKind === "credit"
              ? t("Account credit", "رصيد الحساب")
              : null;

  return (
      <section className="mt-5 rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="flex items-center gap-2 text-sm font-black text-ink">
          <ReceiptText aria-hidden size={16} />
          {t("Your order", "طلبك")}
        </h2>
        <ul className="mt-1 divide-y divide-stone-100 text-start text-sm">
          {order.items.map((item, index) => (
            <li className="flex justify-between gap-4 py-2.5" key={index}>
              <span>
                {item.quantity} × {formatOrderItemName(item, language)}
              </span>
              <span className="shrink-0 font-bold">{money(item.price * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 space-y-1.5 border-t border-stone-200 pt-3 text-sm text-stone-600">
          {breakdown.hasAdjustments ? (
            <>
              <div className="flex justify-between gap-3">
                <dt>{t("Subtotal", "المجموع الفرعي")}</dt>
                <dd>{money(breakdown.subtotal)}</dd>
              </div>
              {breakdown.discount > 0 ? (
                <div className="flex justify-between gap-3 text-leaf">
                  <dt>
                    {breakdown.promoCode
                      ? `${t("Discount", "الخصم")} (${breakdown.promoCode})`
                      : t("Discount", "الخصم")}
                  </dt>
                  <dd dir="ltr">−{money(breakdown.discount)}</dd>
                </div>
              ) : null}
              {breakdown.reward > 0 ? (
                <div className="flex justify-between gap-3 text-leaf">
                  <dt>{t("Reward", "المكافأة")}</dt>
                  <dd dir="ltr">−{money(breakdown.reward)}</dd>
                </div>
              ) : null}
              {onDelivery ? (
                <div className="flex justify-between gap-3">
                  <dt>{t("Delivery", "التوصيل")}</dt>
                  <dd>{breakdown.deliveryFee > 0 ? money(breakdown.deliveryFee) : t("Free", "مجاني")}</dd>
                </div>
              ) : null}
            </>
          ) : null}
          <div className="flex justify-between gap-3 pt-1 text-base font-black text-ink">
            <dt>{t("Total", "الإجمالي")}</dt>
            <dd>{money(order.total)}</dd>
          </div>
        </dl>
        {fulfilmentLine || paymentLine ? (
          <div className="mt-3 space-y-1.5 border-t border-stone-200 pt-3 text-sm text-stone-700">
            {fulfilmentLine ? (
              <p className="flex items-start gap-2">
                <MapPin aria-hidden className="mt-0.5 shrink-0 text-stone-400" size={15} />
                <span className="min-w-0 break-words">{fulfilmentLine}</span>
              </p>
            ) : null}
            {paymentLine ? (
              <p className="flex items-start gap-2">
                <CreditCard aria-hidden className="mt-0.5 shrink-0 text-stone-400" size={15} />
                <span>{paymentLine}</span>
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
  );
}
