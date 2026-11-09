import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import {
  getWhatsAppIntegration,
  integrationAllowsFreeForm,
  sendRestaurantWhatsAppText
} from "@/lib/whatsapp-integration";
import { isServiceWindowOpen } from "@/lib/order-notifications";
import { normalizeCustomerPhone } from "@/lib/whatsapp";

export type RiderWhatsAppResult = {
  delivered: boolean;
  reason: "accepted" | "no_open_service_window" | "transport_failed";
  messageId: string | null;
};

export async function sendRiderWhatsApp(input: {
  restaurantId: string;
  phone: string;
  phoneCountryCode?: string | null;
  message: string;
}): Promise<RiderWhatsAppResult> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error("Rider messaging is unavailable.");
  }

  const phone = normalizeCustomerPhone(
    input.phone,
    input.phoneCountryCode ?? undefined
  );
  const [integration, serviceWindow] = await Promise.all([
    getWhatsAppIntegration(input.restaurantId),
    admin
      .from("whatsapp_service_windows")
      .select("last_inbound_at")
      .eq("restaurant_id", input.restaurantId)
      .eq("phone", phone)
      .maybeSingle()
  ]);

  if (serviceWindow.error) {
    throw new Error("Rider service-window lookup failed.");
  }
  if (
    !integrationAllowsFreeForm(
      integration,
      isServiceWindowOpen(serviceWindow.data?.last_inbound_at)
    )
  ) {
    return {
      delivered: false,
      reason: "no_open_service_window",
      messageId: null
    };
  }

  const messageId = await sendRestaurantWhatsAppText(
    input.restaurantId,
    phone,
    input.message
  );
  return {
    delivered: Boolean(messageId),
    reason: messageId ? "accepted" : "transport_failed",
    messageId
  };
}
