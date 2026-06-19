import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import { hashFeedbackToken } from "@/lib/feedback-utils";
import type {
  CustomerFeedback,
  PublicFeedbackSummary,
  Restaurant
} from "@/lib/types";

export const feedbackTags = [
  "Delicious food",
  "Fast service",
  "Good packaging",
  "Friendly staff",
  "Easy ordering",
  "Great car pickup"
] as const;

export async function getPublicFeedback(
  restaurant: Restaurant
): Promise<PublicFeedbackSummary> {
  if (!restaurant.public_reviews_enabled) {
    return { averageRating: null, reviewCount: 0, reviews: [] };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { averageRating: null, reviewCount: 0, reviews: [] };
  }

  const { data, error } = await supabase
    .from("customer_feedback")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .eq("moderation_status", "approved")
    .order("submitted_at", { ascending: false });

  if (error || !data) {
    return { averageRating: null, reviewCount: 0, reviews: [] };
  }

  const feedback = data as CustomerFeedback[];
  const reviewCount = feedback.length;
  const averageRating =
    reviewCount > 0
      ? feedback.reduce((sum, review) => sum + Number(review.rating), 0) / reviewCount
      : null;
  const reviews = feedback
    .filter((review) => Boolean(review.comment?.trim()))
    .slice(0, 3);

  return { averageRating, reviewCount, reviews };
}

export async function getRestaurantFeedback(restaurantId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("customer_feedback")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("submitted_at", { ascending: false });

  return error ? [] : ((data ?? []) as CustomerFeedback[]);
}

export async function getFeedbackPageContext(token: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !token) {
    return null;
  }

  const { data: request, error } = await supabase
    .from("feedback_requests")
    .select("id,restaurant_id,order_id,expires_at,used_at")
    .eq("token_hash", hashFeedbackToken(token))
    .maybeSingle();

  if (error || !request) {
    return null;
  }

  const [{ data: order }, { data: restaurant }, { data: existingFeedback }] =
    await Promise.all([
      supabase
        .from("orders")
        .select("id,status,customer_name")
        .eq("id", request.order_id)
        .eq("restaurant_id", request.restaurant_id)
        .maybeSingle(),
      supabase
        .from("restaurants")
        .select("*")
        .eq("id", request.restaurant_id)
        .maybeSingle(),
      supabase
        .from("customer_feedback")
        .select("id")
        .eq("order_id", request.order_id)
        .maybeSingle()
    ]);

  if (!order || !restaurant) {
    return null;
  }

  return {
    request,
    order,
    restaurant: restaurant as Restaurant,
    isCompleted: order.status === "Completed",
    isExpired: new Date(request.expires_at).getTime() < Date.now(),
    isSubmitted: Boolean(request.used_at || existingFeedback)
  };
}
