// Order status notifications over the restaurant's active WhatsApp transport.
//
// Meta's rule: any inbound customer message opens a 24h customer-service
// window in which free-form Cloud API texts are FREE. Customers place orders
// by sending a WhatsApp message, so for virtually every order lifecycle the
// window is open — status updates cost nothing. The webhook records window
// opens in whatsapp_service_windows; this module consults that before
// sending, and never attempts an outside-window send (that requires paid
// templates. A connected WhatsApp Web transport does not use Meta's Cloud API
// service-window check, so the provider-aware guard below permits the send.
//
// Product invariant: a notification failure must NEVER fail or slow a status
// change. Everything here is best-effort and never throws.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loyaltyLineForOrder } from "@/lib/loyalty-progress";
import { normalizeCustomerPhone } from "@/lib/whatsapp";
import {
  getWhatsAppIntegration,
  integrationAllowsFreeForm,
  sendRestaurantWhatsAppText
} from "@/lib/whatsapp-integration";
import type { OrderStatus } from "@/lib/types";

export const SERVICE_WINDOW_HOURS = 24;
// Safety margin so we never race the window's edge: a send that leaves our
// servers at 23h59m could arrive after expiry and be dropped by Meta.
export const SERVICE_WINDOW_MARGIN_MINUTES = 5;

export function isServiceWindowOpen(
  lastInboundAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lastInboundAt) {
    return false;
  }

  const openedAt = new Date(lastInboundAt).getTime();

  if (!Number.isFinite(openedAt)) {
    return false;
  }

  const windowMs =
    (SERVICE_WINDOW_HOURS * 60 - SERVICE_WINDOW_MARGIN_MINUTES) * 60 * 1000;
  const elapsed = now.getTime() - openedAt;

  return elapsed >= 0 && elapsed < windowMs;
}

/** Same short reference shown on printed tickets (OrderPrintActions). */
export function orderReference(orderId: string): string {
  return orderId.slice(-8).toUpperCase();
}

type StatusMessageInput = {
  status: OrderStatus;
  orderReference: string;
  restaurantName: string;
  loyaltyLine?: string | null;
};

/**
 * Bilingual (EN + AR) status text, or null for statuses we deliberately don't
 * notify (New is the customer's own submission; Preparing is noise). Orders
 * don't store the customer's language, so both languages ride in one message.
 */
export function buildOrderStatusMessage(input: StatusMessageInput): string | null {
  const ref = input.orderReference;
  const name = input.restaurantName;

  switch (input.status) {
    case "Accepted":
      return [
        `✅ ${name} confirmed your order #${ref}. We'll update you as it progresses.`,
        `تم تأكيد طلبك #${ref} من ${name}. سنوافيك بالتحديثات.`
      ].join("\n");
    case "Ready to Serve":
      return [
        `🍽️ Your order #${ref} at ${name} is ready!`,
        `طلبك #${ref} جاهز الآن في ${name}!`
      ].join("\n");
    case "Out for Delivery":
      return [
        `🛵 Your order #${ref} from ${name} is on the way.`,
        `طلبك #${ref} من ${name} في الطريق إليك.`
      ].join("\n");
    case "Completed": {
      const lines = [
        `🙏 Thank you for ordering from ${name}! Order #${ref} is complete.`,
        `شكراً لطلبك من ${name}! تم إكمال الطلب #${ref}.`
      ];
      if (input.loyaltyLine) {
        lines.push("", input.loyaltyLine);
      }
      return lines.join("\n");
    }
    case "Cancelled":
      return [
        `❌ Your order #${ref} at ${name} was cancelled. Reply here if you need help.`,
        `تم إلغاء طلبك #${ref} في ${name}. رد على هذه الرسالة إذا كنت بحاجة للمساعدة.`
      ].join("\n");
    default:
      return null;
  }
}

type NotifyInput = {
  supabase: SupabaseClient | null;
  restaurant: {
    id: string;
    name: string;
    phone_country_code?: string | null;
    status_notifications_enabled?: boolean | null;
  };
  orderId: string;
  status: OrderStatus;
};

/**
 * Best-effort status notification. Sends only when: the restaurant hasn't
 * disabled notifications, the status has a message, the order has a phone,
 * and that phone's 24h service window is open. Never throws.
 */
export async function sendOrderStatusNotification(input: NotifyInput): Promise<void> {
  try {
    const { supabase, restaurant, orderId, status } = input;

    if (!supabase || restaurant.status_notifications_enabled === false) {
      return;
    }

    const reference = orderReference(orderId);
    const baseMessage = buildOrderStatusMessage({
      status,
      orderReference: reference,
      restaurantName: restaurant.name
    });

    if (!baseMessage) {
      return;
    }

    const { data: order } = await supabase
      .from("orders")
      .select("customer_phone")
      .eq("id", orderId)
      .eq("restaurant_id", restaurant.id)
      .maybeSingle();
    const rawPhone = String(order?.customer_phone ?? "").trim();

    if (!rawPhone) {
      return; // walk-in / no phone
    }

    const phone = normalizeCustomerPhone(
      rawPhone,
      restaurant.phone_country_code ?? undefined
    );
    const { data: window } = await supabase
      .from("whatsapp_service_windows")
      .select("last_inbound_at")
      .eq("restaurant_id", restaurant.id)
      .eq("phone", phone)
      .maybeSingle();

    const integration = await getWhatsAppIntegration(restaurant.id);
    if (
      !integrationAllowsFreeForm(
        integration,
        isServiceWindowOpen(window?.last_inbound_at ?? null)
      )
    ) {
      return; // outside the free window — phase 2 (templates) territory
    }

    let message = baseMessage;

    if (status === "Completed") {
      // The RPC already minted this order's stamp, so the card is current.
      const loyaltyLine = await loyaltyLineForOrder(supabase, restaurant.id, phone);
      message = buildOrderStatusMessage({
        status,
        orderReference: reference,
        restaurantName: restaurant.name,
        loyaltyLine
      }) ?? baseMessage;
    }

    const sent = await sendRestaurantWhatsAppText(
      restaurant.id,
      phone,
      message
    );

    if (!sent) {
      console.info("WhatsOrder status notification not delivered", {
        restaurantId: restaurant.id,
        orderId,
        status
      });
    }
  } catch (error) {
    // Notifications must never break a status change.
    console.error("WhatsOrder status notification failed", {
      restaurantId: input.restaurant.id,
      orderId: input.orderId,
      status: input.status,
      message: error instanceof Error ? error.message : "unknown"
    });
  }
}
