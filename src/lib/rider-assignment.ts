import { formatCurrency } from "@/lib/currency";
import { orderReference } from "@/lib/order-notifications";
import type { DeliveryRider, Order, Restaurant } from "@/lib/types";

function paymentInstruction(order: Order, restaurant: Restaurant) {
  const total = formatCurrency(Number(order.total) || 0, restaurant).replace(/\s+/g, " ");
  switch (order.payment_method) {
    case "Cash on Delivery":
      return [`Amount: ${total}`, "Method: Cash on delivery", "Collect cash from the customer."];
    case "Card on Delivery":
      return [`Amount: ${total}`, "Method: Card on delivery", "Collect payment by card."];
    case "Online Payment":
      return [`Amount: ${total}`, "Method: Paid online", "Already paid. Do NOT collect payment."];
    case "UPI":
      return [
        `Amount: ${total}`,
        "Method: UPI selected",
        "Confirm payment with the restaurant before delivery."
      ];
    default:
      if (order.online_payment_status === "pending") {
        return [
          `Amount: ${total}`,
          "Online payment not confirmed yet — confirm with the restaurant before collecting payment."
        ];
      }
      return [
        `Amount: ${total}`,
        "Payment method not recorded — confirm with the restaurant before collecting payment."
      ];
  }
}

function displayPhone(value?: string | null) {
  if (!value) return "Not provided";
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("971") && digits.length === 12) {
    return `+971 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return digits ? `+${digits}` : value;
}

function pickupAddress(restaurant: Restaurant) {
  const address = restaurant.address?.trim() ?? "";
  const city = restaurant.city?.trim() ?? "";
  if (!address) return city;
  if (!city) return address;

  const normalizedCity = city.toLocaleLowerCase();
  const alreadyIncludesCity = address
    .split(",")
    .some((part) => part.trim().toLocaleLowerCase() === normalizedCity);
  return alreadyIncludesCity ? address : `${address}, ${city}`;
}

export function buildRiderAssignmentMessage(input: {
  order: Order;
  restaurant: Restaurant;
  rider: Pick<DeliveryRider, "name">;
  /** Private link for sharing live location with the customer. */
  trackingUrl?: string | null;
}) {
  const { order, restaurant, rider, trackingUrl } = input;
  const pickup = pickupAddress(restaurant);
  const lines = [
    `🚴 NEW DELIVERY — ${restaurant.name.toLocaleUpperCase()}`,
    "",
    `Order: #${orderReference(order.id)}`,
    `Rider: ${rider.name}`,
    "",
    "📍 PICKUP",
    restaurant.name,
    pickup || restaurant.name,
    `Restaurant: ${displayPhone(restaurant.whatsapp_number)}`,
    "",
    "🏠 DELIVERY",
    `Customer: ${order.customer_name}`,
    `Phone: ${displayPhone(order.customer_phone)}`,
    `Area: ${order.delivery_area || "Not provided"}`,
    `Address: ${order.delivery_address || "Not provided"}`
  ];

  if (order.delivery_landmark) {
    lines.push(`Landmark: ${order.delivery_landmark}`);
  }
  if (order.delivery_google_maps_url) {
    lines.push(`Map: ${order.delivery_google_maps_url}`);
  }

  lines.push("", "💵 PAYMENT", ...paymentInstruction(order, restaurant));
  if (trackingUrl) {
    lines.push(
      "",
      "📡 LIVE LOCATION",
      "When you set off, open this link and keep it open so the customer can see you're on the way:",
      trackingUrl
    );
  }
  lines.push("");
  lines.push("Please contact the restaurant if anything is unclear.");
  return lines.join("\n");
}
