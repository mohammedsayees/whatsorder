import "server-only";

import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hashFeedbackToken } from "@/lib/feedback-utils";
import {
  PUBLIC_CACHE_TTL_SECONDS,
  publicFeedbackTag
} from "@/lib/public-cache";
import type {
  CustomerFeedback,
  PublicFeedbackSummary,
  PublicRestaurant,
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

// Cached public-review summary for the customer menu page. Failures throw so
// they are never cached; feedback submission/moderation revalidates the tag.
const fetchPublicFeedback = (restaurantId: string) =>
  unstable_cache(
    async (): Promise<PublicFeedbackSummary> => {
      const supabase = getSupabaseAdmin();
      if (!supabase) {
        throw new Error("Supabase is not configured");
      }

      const { data, error } = await supabase
        .from("customer_feedback")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("moderation_status", "approved")
        .order("submitted_at", { ascending: false });

      if (error || !data) {
        throw new Error(error?.message ?? "Feedback could not be read");
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
    },
    ["public-feedback", restaurantId],
    {
      revalidate: PUBLIC_CACHE_TTL_SECONDS,
      tags: [publicFeedbackTag(restaurantId)]
    }
  )();

export async function getPublicFeedback(
  restaurant: PublicRestaurant
): Promise<PublicFeedbackSummary> {
  if (!restaurant.public_reviews_enabled) {
    return { averageRating: null, reviewCount: 0, reviews: [] };
  }

  try {
    return await fetchPublicFeedback(restaurant.id);
  } catch {
    // Reviews are decorative on the menu — fail soft, never block the page.
    return { averageRating: null, reviewCount: 0, reviews: [] };
  }
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
