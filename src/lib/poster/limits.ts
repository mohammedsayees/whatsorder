// lib/poster/limits.ts
//
// Poster Studio cost control: per-restaurant generation rate limit and the
// retention window for never-sent posters. One place to tune both.

import "server-only";

import type { getSupabaseAdmin } from "@/lib/supabase";

/** Generations (each = 3 variants + one copy call) per restaurant per window. */
export const POSTER_GENERATIONS_PER_WINDOW = 10;
export const POSTER_GENERATION_WINDOW_SECONDS = 60 * 60;

/** Posters only ever rendered (never sent) are deleted after this many days. */
export const POSTER_RETENTION_DAYS = 30;

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export type PosterRateLimitResult =
  | { status: "allowed" }
  | { status: "limited"; retryAfterSeconds: number }
  | { status: "unavailable" };

/**
 * Atomically checks the limit and records this attempt (see
 * check_poster_generation_rate_limit). Fails closed: if the check can't run,
 * generation doesn't either — this guard exists to cap model spend.
 */
export async function checkPosterGenerationRateLimit(
  admin: Admin,
  restaurantId: string,
  userId: string | null
): Promise<PosterRateLimitResult> {
  const { data, error } = await admin.rpc("check_poster_generation_rate_limit", {
    target_restaurant_id: restaurantId,
    target_user_id: userId,
    max_attempts: POSTER_GENERATIONS_PER_WINDOW,
    window_seconds: POSTER_GENERATION_WINDOW_SECONDS
  });
  if (error) {
    console.error("WhatsOrder poster: rate limit check failed", error.code);
    return { status: "unavailable" };
  }
  const retryAfter = Number(data);
  if (!Number.isFinite(retryAfter)) {
    return { status: "unavailable" };
  }
  return retryAfter > 0
    ? { status: "limited", retryAfterSeconds: Math.ceil(retryAfter) }
    : { status: "allowed" };
}

export function posterRateLimitMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `You've generated ${POSTER_GENERATIONS_PER_WINDOW} poster sets in the last hour. You can generate again in ${minutes} minute${minutes === 1 ? "" : "s"} — your recent posters are below.`;
}
