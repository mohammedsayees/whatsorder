import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Client construction is not free (auth/realtime/postgrest sub-clients), and
// these getters run on every data read. Reuse one client per url+key for the
// lifetime of the serverless instance; keying by url+key keeps behaviour
// correct if env vars differ between calls (e.g. in tests).
const clientCache = new Map<string, SupabaseClient>();

function getCachedClient(url: string, key: string) {
  const cacheKey = `${url}|${key}`;
  let client = clientCache.get(cacheKey);

  if (!client) {
    client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    clientCache.set(cacheKey, client);
  }

  return client;
}

export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return getCachedClient(url, anonKey);
}

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return getCachedClient(url, serviceRoleKey);
}
