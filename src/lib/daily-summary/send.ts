import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getWhatsAppIntegration, integrationAllowsFreeForm, sendRestaurantWhatsAppText } from "@/lib/whatsapp-integration";
import { isServiceWindowOpen } from "@/lib/order-notifications";
import { normalizeCustomerPhone } from "@/lib/whatsapp";

export type SendResult = { delivered: boolean; reason: string };

// `delivered` means transport accepted; read/delivery receipts are not inferred.
export async function sendOwnerMessage(
  restaurantId: string, phone: string | null, text: string, phoneCountryCode?: string
): Promise<SendResult> {
  if (!phone) return { delivered: false, reason: "no_phone" };
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Summary delivery unavailable");
  const to = normalizeCustomerPhone(phone, phoneCountryCode);
  const integration = await getWhatsAppIntegration(restaurantId);
  const window = await admin.from("whatsapp_service_windows").select("last_inbound_at")
    .eq("restaurant_id", restaurantId).eq("phone", to).maybeSingle();
  if (window.error) throw new Error("Summary service window lookup failed");
  if (!integrationAllowsFreeForm(integration, isServiceWindowOpen(window.data?.last_inbound_at))) {
    return { delivered: false, reason: "no_open_service_window" };
  }
  const messageId = await sendRestaurantWhatsAppText(restaurantId, to, text);
  return { delivered: Boolean(messageId), reason: messageId ? "accepted" : "transport_failed" };
}
