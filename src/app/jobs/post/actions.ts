"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { countryProfileFields } from "@/lib/localization";
import { inviteRestaurantUser } from "@/lib/restaurant-invitations";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";
import { UAE_LOCATIONS, type Emirate } from "@/lib/jobs";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function postError(message: string): never {
  redirect(`/jobs/post?error=${encodeURIComponent(message)}`);
}

function slugify(valueToSlug: string) {
  return valueToSlug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function secureHash(valueToHash: string) {
  const salt = process.env.JOB_EMPLOYER_SIGNUP_SALT ?? process.env.JOB_REPORT_SALT;
  if (!salt && process.env.NODE_ENV === "production") {
    throw new Error("JOB_EMPLOYER_SIGNUP_SALT is not configured.");
  }
  return createHash("sha256")
    .update(`${salt ?? "whatsorder-jobs-local"}:${valueToHash}`)
    .digest("hex");
}

async function signupFingerprint() {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headerStore.get("x-real-ip") || "unknown";
  const userAgent = headerStore.get("user-agent") || "unknown";
  return secureHash(`${ip}:${userAgent}`);
}

export async function createJobsEmployerAccountAction(formData: FormData) {
  // Quietly absorb automated submissions without telling bots which field was caught.
  if (value(formData, "website")) redirect("/jobs/post/check-email");

  const admin = getSupabaseAdmin();
  if (!admin) postError("Employer signup is unavailable right now. Please try again later.");

  const restaurantName = value(formData, "restaurant_name");
  const contactName = value(formData, "contact_name");
  const email = value(formData, "email").toLowerCase();
  const emirate = value(formData, "emirate") as Emirate;
  const city = value(formData, "city");
  const address = value(formData, "address");
  const whatsappNumber = normalizeWhatsAppNumber(value(formData, "whatsapp_number"), "971");
  const isAuthorized = formData.get("authorized") === "on";
  const acceptsTerms = formData.get("terms") === "on";

  if (restaurantName.length < 2 || restaurantName.length > 120) {
    postError("Enter a restaurant or café name between 2 and 120 characters.");
  }
  if (contactName.length < 2 || contactName.length > 100) {
    postError("Enter the owner or manager's full name.");
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    postError("Enter a valid work email address.");
  }
  if (!Object.prototype.hasOwnProperty.call(UAE_LOCATIONS, emirate)) {
    postError("Choose a UAE emirate.");
  }
  if (!(UAE_LOCATIONS[emirate] as readonly string[]).includes(city)) {
    postError("Choose a city within the selected emirate.");
  }
  if (address.length > 160) postError("The location must be 160 characters or fewer.");
  if (!/^[1-9][0-9]{7,14}$/.test(whatsappNumber)) {
    postError("Enter a valid WhatsApp number, including the country code.");
  }
  if (!isAuthorized || !acceptsTerms) {
    postError("Confirm that you are authorized to hire and accept the listing rules.");
  }

  let fingerprint: string;
  let emailHash: string;
  try {
    [fingerprint, emailHash] = await Promise.all([
      signupFingerprint(),
      Promise.resolve(secureHash(email))
    ]);
  } catch (error) {
    console.error("WhatsOrder jobs signup hashing failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    postError("Employer signup is unavailable right now. Please try again later.");
  }

  const { data: reservationId, error: reservationError } = await admin.rpc(
    "reserve_job_employer_signup",
    {
      requested_client_fingerprint: fingerprint,
      requested_email_hash: emailHash
    }
  );

  if (reservationError) {
    console.error("WhatsOrder jobs signup rate limit failed", {
      message: reservationError.message
    });
    postError("Employer signup is unavailable right now. Please try again later.");
  }
  if (!reservationId) {
    postError("Too many signup attempts were made. Please try again tomorrow.");
  }

  const { data: existingMemberships, error: membershipLookupError } = await admin
    .from("restaurant_users")
    .select("restaurant_id")
    .eq("email", email)
    .limit(1);

  if (membershipLookupError) {
    await admin
      .from("job_employer_signup_attempts")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", reservationId);
    postError("Employer signup is unavailable right now. Please try again later.");
  }
  if ((existingMemberships ?? []).length > 0) {
    await admin
      .from("job_employer_signup_attempts")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", reservationId);
    redirect("/jobs/post?existing=1");
  }

  const slugBase = slugify(restaurantName) || "restaurant";
  const slug = `${slugBase}-jobs-${randomBytes(4).toString("hex")}`;
  const now = new Date().toISOString();
  const { data: restaurant, error: restaurantError } = await admin
    .from("restaurants")
    .insert({
      name: restaurantName,
      slug,
      whatsapp_number: whatsappNumber,
      ...countryProfileFields("AE"),
      owner_name: contactName,
      owner_email: email,
      owner_phone: whatsappNumber,
      address: address || null,
      city,
      delivery_fee: 0,
      minimum_order_amount: 0,
      status: "trial",
      plan: "trial",
      is_active: true,
      jobs_only: true
    })
    .select("id")
    .single();

  if (restaurantError || !restaurant) {
    await admin
      .from("job_employer_signup_attempts")
      .update({ status: "failed", updated_at: now })
      .eq("id", reservationId);
    console.error("WhatsOrder jobs-only restaurant creation failed", {
      message: restaurantError?.message
    });
    postError("Your Jobs account could not be created. Please try again later.");
  }

  // Establish the tenant-scoped assignment before asking the auth provider to
  // send email. This prevents a delivered activation link from pointing at a
  // tenant whose membership row could not be created.
  const { error: pendingMembershipError } = await admin.from("restaurant_users").insert({
    restaurant_id: restaurant.id,
    email,
    role: "restaurant_admin"
  });
  if (pendingMembershipError) {
    await Promise.all([
      admin.from("restaurants").delete().eq("id", restaurant.id).eq("jobs_only", true),
      admin
        .from("job_employer_signup_attempts")
        .update({ status: "failed", updated_at: now })
        .eq("id", reservationId)
    ]);
    console.error("WhatsOrder jobs-only membership creation failed", {
      message: pendingMembershipError.message
    });
    postError("Your Jobs account could not be created. Please try again later.");
  }

  const inviteResult = await inviteRestaurantUser(
    admin,
    String(restaurant.id),
    email,
    "restaurant_admin"
  );

  if (!inviteResult.ok) {
    await Promise.all([
      admin.from("restaurants").delete().eq("id", restaurant.id).eq("jobs_only", true),
      admin
        .from("job_employer_signup_attempts")
        .update({ status: "failed", updated_at: now })
        .eq("id", reservationId)
    ]);
    console.error("WhatsOrder jobs-only invitation failed", { message: inviteResult.error });
    postError("We could not send the activation email. Please try again later.");
  }

  await admin
    .from("job_employer_signup_attempts")
    .update({
      restaurant_id: restaurant.id,
      status: "invited",
      updated_at: now
    })
    .eq("id", reservationId);

  redirect("/jobs/post/check-email");
}
