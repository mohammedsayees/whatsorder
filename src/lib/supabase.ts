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

function getAnonConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

/**
 * Shared, cached anon client for data reads and stateless auth checks
 * (`auth.getUser(jwt)`, `auth.getClaims(jwt)`) only.
 *
 * Never call a session-creating auth method on it (`signInWithPassword`,
 * `verifyOtp`, `exchangeCodeForSession`, `setSession`, `refreshSession`,
 * `signOut`): even with `persistSession: false`, auth-js keeps the session in
 * an in-memory store and later PostgREST/storage requests on the same client
 * would send that user's JWT, leaking one user's RLS identity into unrelated
 * requests on the instance. Use `createEphemeralAuthClient()` instead.
 */
export function getSupabase() {
  const config = getAnonConfig();
  return config ? getCachedClient(config.url, config.anonKey) : null;
}

/**
 * Fresh, uncached anon client for auth calls that create, refresh, set or
 * clear a session. Each call gets its own in-memory session store, so the
 * session dies with the request and never reaches the shared data client.
 */
export function createEphemeralAuthClient() {
  const config = getAnonConfig();

  if (!config) {
    return null;
  }

  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return getCachedClient(url, serviceRoleKey);
}
