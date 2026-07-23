import { getSupabaseAdmin } from "@/lib/supabase";
import { sendWhatsAppText } from "@/lib/customer-auth/whatsapp-cloud";
import {
  CONNECTOR_SIGNATURE_HEADER,
  CONNECTOR_TIMESTAMP_HEADER,
  signConnectorPayload
} from "@/lib/whatsapp-web-signing";

export type WhatsAppIntegration = {
  restaurant_id: string;
  provider: "whatsapp_web" | "cloud_api";
  status: "disconnected" | "connecting" | "qr_ready" | "active" | "error";
  phone_number: string | null;
  display_name: string | null;
  connector_session_id: string | null;
  qr_payload: string | null;
  qr_expires_at: string | null;
  connected_at: string | null;
  last_seen_at: string | null;
  last_error: string | null;
};

export async function getWhatsAppIntegration(
  restaurantId: string
): Promise<WhatsAppIntegration | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from("whatsapp_integrations")
    .select(
      "restaurant_id, provider, status, phone_number, display_name, connector_session_id, qr_payload, qr_expires_at, connected_at, last_seen_at, last_error"
    )
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (error) {
    console.error("WhatsOrder WhatsApp integration lookup failed", error.code);
    return null;
  }
  return data as WhatsAppIntegration | null;
}

export async function callWhatsAppWebConnector(
  path: string,
  method: "POST" | "DELETE",
  payload: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = process.env.WHATSAPP_WEB_CONNECTOR_URL?.replace(/\/$/, "");
  const secret = process.env.WHATSAPP_WEB_CONNECTOR_SECRET;
  if (!baseUrl || !secret) {
    return { ok: false, error: "WhatsApp Web connector is not configured." };
  }

  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const target = `${method}:${path}`;
  const signature = signConnectorPayload(body, timestamp, secret, target);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        [CONNECTOR_TIMESTAMP_HEADER]: timestamp,
        [CONNECTOR_SIGNATURE_HEADER]: signature
      },
      body,
      cache: "no-store"
    });
    if (!response.ok) {
      const message = (await response.text()).slice(0, 300);
      return { ok: false, error: message || `Connector returned ${response.status}.` };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Connector request failed."
    };
  }
}

/** Send through the restaurant's active transport, with Cloud API fallback. */
export async function sendRestaurantWhatsAppText(
  restaurantId: string,
  to: string,
  body: string
): Promise<string | null> {
  const integration = await getWhatsAppIntegration(restaurantId);
  if (
    integration?.provider === "whatsapp_web" &&
    integration.status === "active" &&
    integration.connector_session_id
  ) {
    const messageId = crypto.randomUUID();
    const result = await callWhatsAppWebConnector(
      `/sessions/${encodeURIComponent(integration.connector_session_id)}/messages`,
      "POST",
      { to, body, clientMessageId: messageId }
    );
    return result.ok ? `web:${messageId}` : null;
  }

  return sendWhatsAppText(to, body);
}

export function integrationAllowsFreeForm(
  integration: WhatsAppIntegration | null,
  cloudWindowOpen: boolean
): boolean {
  return integration?.provider === "whatsapp_web" && integration.status === "active"
    ? true
    : cloudWindowOpen;
}
