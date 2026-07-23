"use server";

import { revalidatePath } from "next/cache";
import { requireRestaurantRole } from "@/lib/super-admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  callWhatsAppWebConnector,
  getWhatsAppIntegration
} from "@/lib/whatsapp-integration";

const CONNECTION_ROLES = ["restaurant_admin", "owner"] as const;

export type WhatsAppConnectionState = {
  error?: string;
  updatedAt?: number;
};

export async function connectWhatsAppWebAction(
  _previous: WhatsAppConnectionState,
  _formData: FormData
): Promise<WhatsAppConnectionState> {
  const session = await requireRestaurantRole([...CONNECTION_ROLES]);
  const admin = getSupabaseAdmin();
  if (!admin) return { error: "Supabase is not configured." };

  const existing = await getWhatsAppIntegration(session.restaurantId);
  const connectorSessionId =
    existing?.connector_session_id ?? crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const { error } = await admin.from("whatsapp_integrations").upsert(
    {
      restaurant_id: session.restaurantId,
      provider: "whatsapp_web",
      status: "connecting",
      connector_session_id: connectorSessionId,
      qr_payload: null,
      qr_expires_at: null,
      last_error: null,
      updated_at: nowIso
    },
    { onConflict: "restaurant_id" }
  );
  if (error) return { error: "Could not prepare the WhatsApp connection." };

  const result = await callWhatsAppWebConnector(
    `/sessions/${encodeURIComponent(connectorSessionId)}/connect`,
    "POST",
    { restaurantId: session.restaurantId }
  );
  if (!result.ok) {
    await admin
      .from("whatsapp_integrations")
      .update({ status: "error", last_error: result.error, updated_at: nowIso })
      .eq("restaurant_id", session.restaurantId);
    return { error: result.error ?? "Could not start the connector." };
  }

  revalidatePath("/admin/integrations/whatsapp");
  return { updatedAt: Date.now() };
}

export async function disconnectWhatsAppWebAction(
  _previous: WhatsAppConnectionState,
  _formData: FormData
): Promise<WhatsAppConnectionState> {
  const session = await requireRestaurantRole([...CONNECTION_ROLES]);
  const integration = await getWhatsAppIntegration(session.restaurantId);
  const admin = getSupabaseAdmin();
  if (!admin) return { error: "Supabase is not configured." };

  if (integration?.connector_session_id) {
    await callWhatsAppWebConnector(
      `/sessions/${encodeURIComponent(integration.connector_session_id)}`,
      "DELETE",
      { restaurantId: session.restaurantId }
    );
  }

  await admin
    .from("whatsapp_integrations")
    .update({
      status: "disconnected",
      phone_number: null,
      display_name: null,
      qr_payload: null,
      qr_expires_at: null,
      connected_at: null,
      updated_at: new Date().toISOString()
    })
    .eq("restaurant_id", session.restaurantId);
  revalidatePath("/admin/integrations/whatsapp");
  return { updatedAt: Date.now() };
}

export type WhatsAppChatbotSettingsState = {
  error?: string;
  savedAt?: number;
};

export async function saveWhatsAppChatbotSettingsAction(
  _previous: WhatsAppChatbotSettingsState,
  formData: FormData
): Promise<WhatsAppChatbotSettingsState> {
  const session = await requireRestaurantRole([...CONNECTION_ROLES]);
  const admin = getSupabaseAdmin();
  if (!admin) return { error: "Supabase is not configured." };

  const languageMode = String(formData.get("language_mode") ?? "customer");
  const tone = String(formData.get("tone") ?? "friendly");
  const pauseMinutes = Math.min(
    10080,
    Math.max(15, Math.round(Number(formData.get("human_pause_minutes") ?? 480)))
  );
  if (!["customer", "english", "arabic", "malayalam"].includes(languageMode)) {
    return { error: "Select a valid language mode." };
  }
  if (!["friendly", "concise", "formal"].includes(tone)) {
    return { error: "Select a valid tone." };
  }

  const { error } = await admin.from("whatsapp_chatbot_settings").upsert(
    {
      restaurant_id: session.restaurantId,
      enabled: formData.get("enabled") === "on",
      answer_text: formData.get("answer_text") === "on",
      answer_audio: formData.get("answer_audio") === "on",
      language_mode: languageMode,
      tone,
      welcome_message:
        String(formData.get("welcome_message") ?? "").trim().slice(0, 1000) ||
        null,
      handoff_message:
        String(formData.get("handoff_message") ?? "").trim().slice(0, 1000) ||
        "I am passing this conversation to our team. Someone will reply shortly.",
      human_pause_minutes: pauseMinutes,
      updated_at: new Date().toISOString()
    },
    { onConflict: "restaurant_id" }
  );
  if (error) return { error: "Could not save chatbot settings." };

  revalidatePath("/admin/integrations/whatsapp");
  return { savedAt: Date.now() };
}

