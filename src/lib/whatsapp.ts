import type { OrderItem, PaymentMethod, Restaurant } from "@/lib/types";
import { formatAED } from "@/lib/currency";
import type { CustomerLanguage } from "@/lib/customer-i18n";

type MessageInput = {
  restaurant: Restaurant;
  customerName: string;
  customerPhone: string;
  deliveryArea: string;
  deliveryAddress: string;
  deliveryLandmark?: string;
  deliveryGoogleMapsUrl?: string;
  notes?: string;
  paymentMethod: PaymentMethod;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  language?: CustomerLanguage;
};

export function buildWhatsAppMessage(input: MessageInput) {
  const lines = input.items.map(
    (item) =>
      `${item.quantity} x ${
        input.language === "ar" && item.name_ar ? item.name_ar : item.name
      } - ${formatAED(item.price * item.quantity)}`
  );

  if (input.language === "ar") {
    const paymentLabel =
      input.paymentMethod === "Cash on Delivery" ? "الدفع نقدا عند الاستلام" : "بطاقة عند الاستلام";

    return [
      `طلب جديد - ${input.restaurant.name}`,
      "",
      "بيانات العميل:",
      `الاسم: ${input.customerName}`,
      `الهاتف: ${input.customerPhone}`,
      "",
      "تفاصيل التوصيل:",
      `المنطقة: ${input.deliveryArea}`,
      `العنوان: ${input.deliveryAddress}`,
      `علامة مميزة: ${input.deliveryLandmark || "غير مذكور"}`,
      `الموقع: ${input.deliveryGoogleMapsUrl || "لم تتم المشاركة"}`,
      "",
      "الأصناف:",
      ...lines,
      "",
      `المجموع الفرعي: ${formatAED(input.subtotal)}`,
      `رسوم التوصيل: ${formatAED(input.deliveryFee)}`,
      `الإجمالي: ${formatAED(input.total)}`,
      "",
      `طريقة الدفع: ${paymentLabel}`,
      "",
      input.notes ? `ملاحظات: ${input.notes}` : "ملاحظات: لا يوجد"
    ].join("\n");
  }

  return [
    `New Order - ${input.restaurant.name}`,
    "",
    "Customer:",
    `Name: ${input.customerName}`,
    `Phone: ${input.customerPhone}`,
    "",
    "Delivery Details:",
    `Area: ${input.deliveryArea}`,
    `Address: ${input.deliveryAddress}`,
    `Landmark: ${input.deliveryLandmark || "Not provided"}`,
    `Location: ${input.deliveryGoogleMapsUrl || "Not shared"}`,
    "",
    "Items:",
    ...lines,
    "",
    `Subtotal: ${formatAED(input.subtotal)}`,
    `Delivery Fee: ${formatAED(input.deliveryFee)}`,
    `Total: ${formatAED(input.total)}`,
    "",
    `Payment: ${input.paymentMethod}`,
    "",
    input.notes ? `Notes: ${input.notes}` : "Notes: None"
  ].join("\n");
}

export function normalizeWhatsAppNumber(number: string) {
  const digits = number.replace(/[^\d]/g, "");

  if (digits.startsWith("00")) {
    return digits.slice(2);
  }

  if (digits.startsWith("971")) {
    return digits;
  }

  if (digits.startsWith("05") && digits.length === 10) {
    return `971${digits.slice(1)}`;
  }

  if (digits.startsWith("5") && digits.length === 9) {
    return `971${digits}`;
  }

  return digits;
}

export function buildWhatsAppUrl(number: string, message: string) {
  const cleanNumber = normalizeWhatsAppNumber(number);
  return `https://api.whatsapp.com/send?phone=${cleanNumber}&text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppAppUrl(number: string, message: string) {
  const cleanNumber = normalizeWhatsAppNumber(number);
  return `whatsapp://send?phone=${cleanNumber}&text=${encodeURIComponent(message)}`;
}
