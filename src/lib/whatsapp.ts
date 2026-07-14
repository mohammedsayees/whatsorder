import type {
  FulfilmentType,
  OrderItem,
  PaymentMethod,
  PublicRestaurant
} from "@/lib/types";
import { formatOrderItemName } from "@/lib/cart-line";
import { formatCurrency } from "@/lib/currency";
import type { CustomerLanguage } from "@/lib/customer-i18n";

type MessageInput = {
  restaurant: PublicRestaurant;
  customerName: string;
  customerPhone: string;
  fulfilmentType: FulfilmentType;
  carPlateNumber?: string;
  carDescription?: string;
  tableNumber?: string;
  deliveryArea?: string;
  deliveryAddress?: string;
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
      `${item.quantity} x ${formatOrderItemName(
        item,
        input.language ?? "en"
      )} - ${formatCurrency(item.price * item.quantity, input.restaurant)}`
  );

  if (input.language === "ar") {
    const paymentLabel =
      input.paymentMethod === "Cash on Delivery"
        ? "الدفع نقدا عند الاستلام"
        : input.paymentMethod === "UPI"
          ? "UPI"
          : "بطاقة عند الاستلام";
    const fulfilmentLabel =
      input.fulfilmentType === "delivery"
        ? "توصيل"
        : input.fulfilmentType === "takeaway"
          ? "استلام من المطعم"
          : input.fulfilmentType === "car_pickup"
            ? "التوصيل إلى السيارة"
            : "داخل المطعم";
    const fulfilmentLines =
      input.fulfilmentType === "delivery"
        ? [
            "",
            "تفاصيل التوصيل:",
            `المنطقة: ${input.deliveryArea}`,
            `العنوان: ${input.deliveryAddress}`,
            `علامة مميزة: ${input.deliveryLandmark || "غير مذكور"}`,
            `الموقع: ${input.deliveryGoogleMapsUrl || "لم تتم المشاركة"}`
          ]
        : input.fulfilmentType === "car_pickup"
          ? [
              "",
              "بيانات السيارة:",
              `رقم اللوحة: ${input.carPlateNumber}`,
              `السيارة: ${input.carDescription || "غير مذكور"}`
            ]
          : input.fulfilmentType === "dine_in"
            ? ["", "تفاصيل الجلسة:", `رقم الطاولة: ${input.tableNumber}`]
            : ["", `الاستلام من: ${input.restaurant.address || input.restaurant.name}`];

    return [
      `طلب ${fulfilmentLabel} جديد - ${input.restaurant.name}`,
      "",
      "بيانات العميل:",
      `الاسم: ${input.customerName}`,
      `الهاتف: ${input.customerPhone}`,
      ...fulfilmentLines,
      "",
      "الأصناف:",
      ...lines,
      "",
      `المجموع الفرعي: ${formatCurrency(input.subtotal, input.restaurant)}`,
      ...(input.deliveryFee > 0 ? [`رسوم التوصيل: ${formatCurrency(input.deliveryFee, input.restaurant)}`] : []),
      `الإجمالي: ${formatCurrency(input.total, input.restaurant)}`,
      "",
      `طريقة الدفع: ${paymentLabel}`,
      "",
      input.notes ? `ملاحظات: ${input.notes}` : "ملاحظات: لا يوجد"
    ].join("\n");
  }

  const fulfilmentLabel =
    input.fulfilmentType === "delivery"
      ? "Delivery"
      : input.fulfilmentType === "takeaway"
        ? "Takeaway"
        : input.fulfilmentType === "car_pickup"
          ? "Car Pickup"
          : "Dine-In";
  const fulfilmentLines =
    input.fulfilmentType === "delivery"
      ? [
          "",
          "Delivery Details:",
          `Area: ${input.deliveryArea}`,
          `Address: ${input.deliveryAddress}`,
          `Landmark: ${input.deliveryLandmark || "Not provided"}`,
          `Location: ${input.deliveryGoogleMapsUrl || "Not shared"}`
        ]
      : input.fulfilmentType === "car_pickup"
        ? [
            "",
            "Car Details:",
            `Plate number: ${input.carPlateNumber}`,
            `Car: ${input.carDescription || "Not provided"}`
          ]
        : input.fulfilmentType === "dine_in"
          ? ["", "Dine-In Details:", `Table: ${input.tableNumber}`]
          : ["", `Collect from: ${input.restaurant.address || input.restaurant.name}`];

  return [
    `New ${fulfilmentLabel} Order - ${input.restaurant.name}`,
    "",
    "Customer:",
    `Name: ${input.customerName}`,
    `Phone: ${input.customerPhone}`,
    ...fulfilmentLines,
    "",
    "Items:",
    ...lines,
    "",
    `Subtotal: ${formatCurrency(input.subtotal, input.restaurant)}`,
    ...(input.deliveryFee > 0 ? [`Delivery Fee: ${formatCurrency(input.deliveryFee, input.restaurant)}`] : []),
    `Total: ${formatCurrency(input.total, input.restaurant)}`,
    "",
    `Payment: ${input.paymentMethod}`,
    "",
    input.notes ? `Notes: ${input.notes}` : "Notes: None"
  ].join("\n");
}

export function normalizeCustomerPhone(number: string, phoneCountryCode = "971") {
  const digits = number.replace(/[^\d]/g, "");

  if (digits.startsWith("00")) {
    return digits.slice(2);
  }

  if (digits.startsWith(phoneCountryCode)) {
    return digits;
  }

  if (phoneCountryCode === "971" && digits.startsWith("05") && digits.length === 10) {
    return `971${digits.slice(1)}`;
  }

  if (phoneCountryCode === "971" && digits.startsWith("5") && digits.length === 9) {
    return `971${digits}`;
  }

  if (phoneCountryCode === "91" && /^[6-9]\d{9}$/.test(digits)) {
    return `91${digits}`;
  }

  if (phoneCountryCode === "91" && /^0[6-9]\d{9}$/.test(digits)) {
    return `91${digits.slice(1)}`;
  }

  return digits;
}

export const normalizeWhatsAppNumber = normalizeCustomerPhone;

export function buildWhatsAppUrl(number: string, message: string, phoneCountryCode = "971") {
  const cleanNumber = normalizeCustomerPhone(number, phoneCountryCode);
  return `https://api.whatsapp.com/send?phone=${cleanNumber}&text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppAppUrl(number: string, message: string, phoneCountryCode = "971") {
  const cleanNumber = normalizeCustomerPhone(number, phoneCountryCode);
  return `whatsapp://send?phone=${cleanNumber}&text=${encodeURIComponent(message)}`;
}
