// lib/whatsapp-cloud-tenant.ts
//
// The platform has ONE WhatsApp Cloud API number (WHATSAPP_PHONE_NUMBER_ID).
// Until per-tenant numbers exist, exactly one restaurant owns it: inbound
// webhook traffic is filed under that restaurant only, and no other tenant may
// send through it (their customers' replies would land in the owner's inbox).
//
// Owner is WHATSAPP_CLOUD_OWNER_SLUG, falling back to the default café slug so
// the pilot keeps working with no new env.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

export function cloudNumberOwnerSlug(): string {
  return (
    process.env.WHATSAPP_CLOUD_OWNER_SLUG?.trim() ||
    process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG?.trim() ||
    "chaixpress"
  );
}

/**
 * True only when an inbound webhook change was addressed to the platform's
 * configured Cloud number. Unconfigured or missing ids never match, so
 * unmapped traffic is dropped instead of defaulting to a tenant.
 */
export function isPlatformCloudPhoneNumberId(
  phoneNumberId: string | null | undefined
): boolean {
  const configured = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  return Boolean(configured && phoneNumberId && phoneNumberId === configured);
}

/**
 * Whether this restaurant may send through the shared Cloud number. Fails
 * closed on lookup errors.
 */
export async function restaurantOwnsCloudNumber(
  restaurantId: string
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin || !restaurantId) {
    return false;
  }
  const { data, error } = await admin
    .from("restaurants")
    .select("slug")
    .eq("id", restaurantId)
    .maybeSingle();
  if (error) {
    console.error("WhatsOrder Cloud owner lookup failed", error.code);
    return false;
  }
  return (data as { slug?: string } | null)?.slug === cloudNumberOwnerSlug();
}
