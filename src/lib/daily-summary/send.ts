import "server-only";

export type SendResult = { delivered: boolean; reason: string };

/**
 * The single owner-message send seam.
 *
 * There is no programmatic WhatsApp outbound path in the product yet — every
 * existing WhatsApp flow is a wa.me click-link (see src/lib/whatsapp.ts). Until
 * the WhatsApp Cloud API migration lands, the daily summary is delivered by
 * surfacing it on the admin dashboard (pull). This function records the intent
 * so the run log reflects that delivery was attempted; swap this one
 * implementation for a real Cloud API send when it's available.
 *
 * Delivery target is resolved by the caller as daily_summary_phone ?? owner_phone.
 */
export async function sendOwnerMessage(phone: string | null, text: string): Promise<SendResult> {
  if (!phone) {
    return { delivered: false, reason: "no_phone" };
  }

  console.info("WhatsOrder daily summary ready for owner", {
    phone,
    preview: text.slice(0, 120)
  });

  // No outbound channel yet — the dashboard card is the delivery surface.
  return { delivered: false, reason: "no_outbound_channel" };
}
