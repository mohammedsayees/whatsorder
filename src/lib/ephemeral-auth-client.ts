import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// A brand-new anon client for ONE auth operation (verifyOtp, sign-in,
// signInWithOtp). supabase-js keeps any session it receives in memory even
// with persistSession: false, so session-creating calls must never run on the
// cached client from getSupabase() — later requests on the same server
// instance would carry this user's token.
export function createEphemeralAuthClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}
