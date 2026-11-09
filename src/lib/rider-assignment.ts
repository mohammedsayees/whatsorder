import { formatCurrency } from "@/lib/currency";
import { orderReference } from "@/lib/order-notifications";
import type { DeliveryRider, Order, Restaurant } from "@/lib/types";

function paymentInstruction(order: Order, restaurant: Restaurant) {
  const total = formatCurrency(Number(order.total) || 0, restaurant);
  switch (order.payment_method) {
    case "Cash on Delivery":
      return `Payment: collect ${total} in cash.`;
    case "Card on Delivery":
      return `Payment: collect ${total} by card.`;
    case "UPI":
      return `Payment: UPI selected for ${total}; confirm payment with the restaurant.`;
    default:
      return `Payment: not recorded; confirm collection of ${total} with the restaurant.`;
  }
}

export function buildRiderAssignmentMessage(input: {
  order: Order;
  restaurant: Restaurant;
  rider: Pick<DeliveryRider, "name">;
}) {
  const { order, restaurant, rider } = input;
  const pickupAddress = [restaurant.address, restaurant.city]
    .filter(Boolean)
    .join(", ");
  const lines = [
    `Delivery assignment — ${restaurant.name}`,
    `Order #${orderReference(order.id)}`,
    `Rider: ${rider.name}`,
    `Pickup: ${pickupAddress || restaurant.name}`,
    `Restaurant contact: ${restaurant.whatsapp_number}`,
    `Customer: ${order.customer_name}`,
    `Phone: ${order.customer_phone}`,
    `Area: ${order.delivery_area || "Not provided"}`,
    `Address: ${order.delivery_address || "Not provided"}`
  ];

  if (order.delivery_landmark) {
    lines.push(`Landmark: ${order.delivery_landmark}`);
  }
  if (order.delivery_google_maps_url) {
    lines.push(`Map: ${order.delivery_google_maps_url}`);
  }

  lines.push(paymentInstruction(order, restaurant));
  lines.push("Please contact the restaurant if anything is unclear.");
  return lines.join("\n");
}
