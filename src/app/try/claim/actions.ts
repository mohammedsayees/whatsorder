"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  demoClaimCookieName,
  hashDemoClaimToken,
  parseDemoClaimCookie
} from "@/lib/demo-claim";
import {
  countryProfileFields,
  getCountryProfile,
  isCountryCode
} from "@/lib/localization";
import { revalidatePublicRestaurantCache } from "@/lib/public-cache";
import { inviteRestaurantUser } from "@/lib/restaurant-invitations";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";
import { FOUNDER_WHATSAPP_NUMBER } from "@/lib/demo-store";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function claimError(message: string): never {
  redirect(`/try/claim?error=${encodeURIComponent(message)}`);
}

function safeClaimDatabaseError(message: string | undefined) {
  if (message?.includes("already assigned to another restaurant")) {
    return "This email is already assigned to another restaurant.";
  }
  if (message?.includes("invalid or has expired")) {
    return "This private claim session is invalid or has expired. Build the demo again on this device.";
  }
  return "Your restaurant could not be claimed right now. Try again in a moment.";
}

export async function claimDemoRestaurantAction(formData: FormData) {
  const admin = getSupabaseAdmin();
  const cookieStore = await cookies();
  const claim = parseDemoClaimCookie(cookieStore.get(demoClaimCookieName)?.value);
  if (!admin || !claim) {
    claimError("This private claim session is missing or has expired. Build the demo again on this device.");
  }

  const email = field(formData, "owner_email").toLowerCase();
  const countryValue = field(formData, "country_code");
  if (!isCountryCode(countryValue)) {
    claimError("Choose your restaurant country.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    claimError("Enter a valid owner email address.");
  }

  const country = getCountryProfile(countryValue);
  const whatsappNumber = normalizeWhatsAppNumber(
    field(formData, "whatsapp_number"),
    country.phoneCountryCode
  );
  if (!whatsappNumber) {
    claimError(`Enter a valid ${country.countryName} WhatsApp number.`);
  }
  if (whatsappNumber === FOUNDER_WHATSAPP_NUMBER) {
    claimError("Enter your restaurant's own WhatsApp number, not the demo number.");
  }

  const localization = countryProfileFields(countryValue);
  const { data: restaurantId, error } = await admin.rpc("claim_demo_restaurant", {
    target_restaurant_id: claim.restaurantId,
    submitted_claim_token_hash: hashDemoClaimToken(claim.token),
    submitted_owner_email: email,
    submitted_whatsapp_number: whatsappNumber,
    submitted_country_code: localization.country_code,
    submitted_currency_code: localization.currency_code,
    submitted_locale: localization.locale,
    submitted_phone_country_code: localization.phone_country_code,
    submitted_time_zone: localization.time_zone
  });

  if (error || !restaurantId) {
    claimError(safeClaimDatabaseError(error?.message));
  }

  cookieStore.set(demoClaimCookieName, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/try/claim",
    maxAge: 0
  });

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("id,slug")
    .eq("id", String(restaurantId))
    .maybeSingle();

  const invitation = await inviteRestaurantUser(
    admin,
    String(restaurantId),
    email,
    "restaurant_admin"
  );

  if (restaurant) {
    revalidatePublicRestaurantCache({ id: String(restaurant.id), slug: String(restaurant.slug) });
    revalidatePath(`/r/${restaurant.slug}`);
  }
  revalidatePath("/super-admin/restaurants");

  if (!invitation.ok) {
    redirect(
      `/try/claim?claimed=1&invite_error=${encodeURIComponent(
        "Your restaurant is secured, but the activation email could not be sent. WhatsOrder support can resend it without changing your store."
      )}`
    );
  }

  redirect("/try/claim?sent=1");
}
