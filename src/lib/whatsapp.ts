import type { OrderItem, PaymentMethod, Restaurant } from "@/lib/types";
import { formatAED } from "@/lib/currency";

type MessageInput = {
  restaurant: Restaurant;
  customerName: string;
  customerPhone: string;
  deliveryArea: string;
  deliveryAddress: string;
  notes?: string;
  paymentMethod: PaymentMethod;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
};

export function buildWhatsAppMessage(input: MessageInput) {
  const lines = input.items.map(
    (item) => `- ${item.quantity}x ${item.name} (${formatAED(item.price * item.quantity)})`
  );

  return [
    `New order for ${input.restaurant.name}`,
    "",
    "Items:",
    ...lines,
    "",
    `Subtotal: ${formatAED(input.subtotal)}`,
    `Delivery fee: ${formatAED(input.deliveryFee)}`,
    `Total: ${formatAED(input.total)}`,
    "",
    `Customer: ${input.customerName}`,
    `Phone: ${input.customerPhone}`,
    `Area: ${input.deliveryArea}`,
    `Address: ${input.deliveryAddress}`,
    `Payment: ${input.paymentMethod}`,
    input.notes ? `Notes: ${input.notes}` : "Notes: None"
  ].join("\n");
}

export function buildWhatsAppUrl(number: string, message: string) {
  const cleanNumber = number.replace(/[^\d]/g, "");
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
}
