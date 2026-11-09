import type { OrderConfirmation } from "@/lib/order-confirmation";
import type { PublicRestaurant } from "@/lib/types";
import Link from "next/link";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { formatCurrency } from "@/lib/currency";
import { formatOrderItemName } from "@/lib/cart-line";
import { OrderPushPrompt } from "@/components/customer/OrderPushPrompt";

export function SavedOrderConfirmation({ restaurant, order, language, webPushPublicKey }: {
  restaurant: PublicRestaurant; order: OrderConfirmation; language?: string; webPushPublicKey: string | null;
}) {
  const active = order.status !== "Cancelled" && order.status !== "Completed";
  const arabic = language === "ar";
  const t = (en: string, ar: string) => arabic ? ar : en;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10 text-center" dir={arabic ? "rtl" : "ltr"} lang={arabic ? "ar" : "en"}>
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-mint text-leaf">
        <CheckCircle2 size={34} />
      </div>
      <h1 className="mt-6 text-3xl font-black">{t("Order saved", "تم حفظ الطلب")}</h1>
      <p className="mt-3 leading-7 text-stone-600">
        {order.status === "New"
          ? t("Your order is saved. Send it on WhatsApp below. The restaurant has not accepted it yet.", "تم حفظ طلبك. أرسله عبر واتساب أدناه. لم يقبل المطعم الطلب بعد.")
          : `${t("Restaurant status", "حالة الطلب")}: ${order.status}.`}
      </p>
      <p className="mt-4 rounded-lg bg-stone-100 px-4 py-3 text-sm font-bold text-stone-700">
        {t("Reference", "رقم الطلب")}: {order.id.slice(-8).toUpperCase()}
      </p>
      <ul className="mt-4 divide-y divide-stone-200 text-start">
        {order.items.map((item, index) => (
          <li className="flex justify-between gap-4 py-3" key={index}>
            <span>{item.quantity} × {formatOrderItemName(item, arabic ? "ar" : "en")}</span>
            <span>{formatCurrency(item.price * item.quantity, restaurant)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-lg font-bold">{t("Total", "الإجمالي")}: {formatCurrency(order.total, restaurant)}</p>
      <div className="mt-6 flex flex-col gap-3">
        <a className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-leaf px-5 py-4 font-bold text-white"
          href={buildWhatsAppUrl(restaurant.whatsapp_number,
            active ? order.whatsapp_message : `Hi, I need help with order #${order.id.slice(-8).toUpperCase()}.`,
            restaurant.phone_country_code)} target="_blank" rel="noopener noreferrer">
          <MessageCircle size={18} />
          {active ? t("Send / resend this order on WhatsApp", "إرسال الطلب أو إعادة إرساله عبر واتساب") : t("Contact restaurant about this order", "تواصل مع المطعم بشأن هذا الطلب")}
        </a>
        <p className="text-sm text-stone-600">
          {t("You can return to this page to reopen WhatsApp without placing another order.", "يمكنك العودة إلى هذه الصفحة لفتح واتساب دون إنشاء طلب جديد.")}
        </p>
        {webPushPublicKey ? <OrderPushPrompt orderId={order.id} publicKey={webPushPublicKey}
          restaurantSlug={restaurant.slug} /> : null}
        <Link className="focus-ring rounded-full border border-stone-200 px-5 py-3 font-bold text-ink"
          href={`/r/${restaurant.slug}`}>{t("Back to menu", "العودة إلى القائمة")}</Link>
      </div>
    </main>
  );
}
