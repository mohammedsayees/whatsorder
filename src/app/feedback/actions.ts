"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import {
  feedbackTags,
  getFeedbackPageContext
} from "@/lib/feedback";
import { customerDisplayName, hashFeedbackToken } from "@/lib/feedback-utils";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantAdmin, requireRestaurantRole } from "@/lib/super-admin-auth";
import { getPublicAppUrl } from "@/lib/super-admin-data";

type FeedbackRequestResult =
  | { ok: true; whatsappUrl: string }
  | { ok: false; error: string };

export async function createFeedbackRequestAction(
  orderId: string
): Promise<FeedbackRequestResult> {
  const session = await requireRestaurantAdmin();
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return { ok: false, error: "Feedback requests need Supabase access." };
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select("id,status,customer_phone")
    .eq("id", orderId)
    .eq("restaurant_id", session.restaurantId)
    .maybeSingle();

  if (error || !order) {
    return { ok: false, error: "Order could not be found." };
  }

  if (order.status !== "Completed") {
    return { ok: false, error: "Feedback can only be requested after completion." };
  }

  const { data: existingFeedback } = await supabase
    .from("customer_feedback")
    .select("id")
    .eq("order_id", order.id)
    .maybeSingle();

  if (existingFeedback) {
    return { ok: false, error: "Feedback has already been submitted." };
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { error: requestError } = await supabase.from("feedback_requests").upsert(
    {
      restaurant_id: session.restaurantId,
      order_id: order.id,
      token_hash: hashFeedbackToken(token),
      expires_at: expiresAt,
      used_at: null,
      created_at: new Date().toISOString()
    },
    { onConflict: "order_id" }
  );

  if (requestError) {
    return { ok: false, error: "Feedback link could not be created." };
  }

  const feedbackUrl = `${getPublicAppUrl()}/feedback/${token}`;
  const message = [
    `Thank you for ordering from ${session.restaurant.name}!`,
    "",
    "We hope you enjoyed your order. Please share your feedback:",
    feedbackUrl
  ].join("\n");

  return {
    ok: true,
    whatsappUrl: buildWhatsAppUrl(String(order.customer_phone), message)
  };
}

export async function moderateFeedbackAction(formData: FormData) {
  const session = await requireRestaurantRole(["restaurant_admin", "owner", "manager"]);
  const supabase = getSupabaseAdmin();
  const feedbackId = String(formData.get("feedback_id") ?? "");
  const requestedStatus = String(formData.get("moderation_status") ?? "");
  const moderationStatus =
    requestedStatus === "approved" || requestedStatus === "hidden"
      ? requestedStatus
      : null;

  if (!supabase || !feedbackId || !moderationStatus) {
    return;
  }

  const { error } = await supabase
    .from("customer_feedback")
    .update({
      moderation_status: moderationStatus,
      published_at: moderationStatus === "approved" ? new Date().toISOString() : null
    })
    .eq("id", feedbackId)
    .eq("restaurant_id", session.restaurantId);

  if (error) {
    throw new Error(`Feedback moderation failed: ${error.message}`);
  }

  revalidatePath("/admin/feedback");
  revalidatePath(`/r/${session.restaurant.slug}`);
}

export async function submitFeedbackAction(token: string, formData: FormData) {
  const context = await getFeedbackPageContext(token);
  const supabase = getSupabaseAdmin();

  if (!context || !supabase) {
    redirect(`/feedback/${encodeURIComponent(token)}?error=This%20feedback%20link%20is%20invalid.`);
  }

  if (!context.isCompleted || context.isExpired || context.isSubmitted) {
    redirect(`/feedback/${encodeURIComponent(token)}?error=Feedback%20is%20not%20available%20for%20this%20order.`);
  }

  const rating = Number(formData.get("rating"));
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 1000);
  const anonymous = formData.get("anonymous") === "on";
  const tags = formData
    .getAll("tags")
    .map(String)
    .filter((tag) => feedbackTags.includes(tag as (typeof feedbackTags)[number]));

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    redirect(`/feedback/${encodeURIComponent(token)}?error=Please%20choose%20a%20star%20rating.`);
  }

  const { error } = await supabase.from("customer_feedback").insert({
    restaurant_id: context.request.restaurant_id,
    order_id: context.request.order_id,
    rating,
    tags,
    comment: comment || null,
    customer_display_name: customerDisplayName(context.order.customer_name, anonymous),
    is_verified_order: true,
    moderation_status: comment ? "pending" : "approved",
    published_at: comment ? null : new Date().toISOString()
  });

  if (error) {
    redirect(
      `/feedback/${encodeURIComponent(token)}?error=${encodeURIComponent(
        error.code === "23505"
          ? "Feedback has already been submitted for this order."
          : "Feedback could not be saved. Please try again."
      )}`
    );
  }

  await supabase
    .from("feedback_requests")
    .update({ used_at: new Date().toISOString() })
    .eq("id", context.request.id);

  redirect(`/feedback/${encodeURIComponent(token)}?submitted=1`);
}
