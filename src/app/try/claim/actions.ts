"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getClaimableDemo } from "@/app/try/claim/claimable-demo";
import { demoClaimCookieName, hashDemoClaimToken } from "@/lib/demo-claim";
import { countryProfileFields, getCountryProfile } from "@/lib/localization";
import { revalidatePublicRestaurantCache } from "@/lib/public-cache";
import { inviteRestaurantUser } from "@/lib/restaurant-invitations";
import { normalizeStoreSlug, storeSlugError } from "@/lib/store-slug";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";
import { FOUNDER_WHATSAPP_NUMBER } from "@/lib/demo-store";

export type ClaimFormState = {
  error: string | null;
  values: { owner_email: string; whatsapp_number: string; slug: string };
};

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function safeClaimDatabaseError(message: string | undefined) {
  if (message?.includes("already assigned to another restaurant")) {
    return "This email is already assigned to another restaurant.";
  }
  if (message?.includes("invalid or has expired")) {
    return "This private claim session is invalid or has expired. Build the demo again on this device.";
  }
  if (message?.includes("store link is already taken") || message?.includes("restaurants_slug_key")) {
    return "That store link is already taken. Try another one.";
  }
  if (message?.includes("valid store link")) {
    return "Choose a valid store link: lowercase letters, numbers and hyphens.";
  }
  return "Your restaurant could not be claimed right now. Try again in a moment.";
}

export async function claimDemoRestaurantAction(
  _previous: ClaimFormState,
  formData: FormData
): Promise<ClaimFormState> {
  const values = {
    owner_email: field(formData, "owner_email").toLowerCase().slice(0, 254),
    whatsapp_number: field(formData, "whatsapp_number").slice(0, 20),
    slug: normalizeStoreSlug(field(formData, "slug"))
  };
  const fail = (error: string): ClaimFormState => ({ error, values });

  const admin = getSupabaseAdmin();
  const demo = await getClaimableDemo();
  if (!admin || !demo) {
    return fail("This private claim session is missing or has expired. Build the demo again on this device.");
  }

  const email = values.owner_email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("Enter a valid owner email address.");
  }

  // Country is fixed by the demo build: the AI read prices in that currency.
  const country = getCountryProfile(demo.countryCode);
  const whatsappNumber = normalizeWhatsAppNumber(values.whatsapp_number, country.phoneCountryCode);
  if (!whatsappNumber) {
    return fail(`Enter a valid ${country.countryName} WhatsApp number.`);
  }
  if (whatsappNumber === FOUNDER_WHATSAPP_NUMBER) {
    return fail("Enter your restaurant's own WhatsApp number, not the demo number.");
  }

  const slugError = storeSlugError(values.slug);
  if (slugError) {
    return fail(slugError);
  }

  // Friendly early check; the RPC re-checks under its lock and the unique
  // constraint is the final guard.
  const { data: slugOwner } = await admin
    .from("restaurants")
    .select("id")
    .eq("slug", values.slug)
    .neq("id", demo.id)
    .maybeSingle();
  if (slugOwner) {
    return fail("That store link is already taken. Try another one.");
  }

  const localization = countryProfileFields(demo.countryCode);
  const { data: restaurantId, error } = await admin.rpc("claim_demo_restaurant", {
    target_restaurant_id: demo.id,
    submitted_claim_token_hash: hashDemoClaimToken(demo.claimToken),
    submitted_owner_email: email,
    submitted_whatsapp_number: whatsappNumber,
    submitted_country_code: localization.country_code,
    submitted_currency_code: localization.currency_code,
    submitted_locale: localization.locale,
    submitted_phone_country_code: localization.phone_country_code,
    submitted_time_zone: localization.time_zone,
    submitted_slug: values.slug
  });

  if (error || !restaurantId) {
    return fail(safeClaimDatabaseError(error?.message));
  }

  const cookieStore = await cookies();
  cookieStore.set(demoClaimCookieName, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/try/claim",
    maxAge: 0
  });

  const invitation = await inviteRestaurantUser(
    admin,
    String(restaurantId),
    email,
    "restaurant_admin"
  );

  // Clear both the throwaway demo link and the new permanent one.
  revalidatePublicRestaurantCache({ id: demo.id, slug: demo.slug });
  revalidatePublicRestaurantCache({ id: demo.id, slug: values.slug });
  revalidatePath(`/r/${demo.slug}`);
  revalidatePath(`/r/${values.slug}`);
  revalidatePath("/super-admin/restaurants");

  const linkParam = `&link=${encodeURIComponent(values.slug)}`;
  if (!invitation.ok) {
    redirect(
      `/try/claim?claimed=1${linkParam}&invite_error=${encodeURIComponent(
        "Your restaurant is secured, but the activation email could not be sent. WhatsOrder support can resend it without changing your store."
      )}`
    );
  }

  redirect(`/try/claim?sent=1${linkParam}`);
}
