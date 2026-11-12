// Maintenance switch, applied at build time from next.config.ts (no
// "server-only" import and no "@/" alias: next.config loads this file
// directly). Off by default: no rewrite exists, so normal requests pay nothing.
//
// MAINTENANCE_MODE=true          every path (pages, server actions, API routes,
//                                webhooks, crons) is rewritten to a 503 page.
// MAINTENANCE_BYPASS_SECRET=...  optional; an operator who opens
//                                /api/maintenance/bypass?token=<secret> gets an
//                                httpOnly cookie that skips the rewrite.
// Vercel applies env changes on the next deploy, so toggling = redeploy.

export const MAINTENANCE_PATH = "/api/maintenance";
export const MAINTENANCE_BYPASS_PATH = "/api/maintenance/bypass";
export const MAINTENANCE_BYPASS_COOKIE = "wo_maintenance_bypass";

type Env = Record<string, string | undefined>;

export function isMaintenanceMode(env: Env = process.env) {
  return env.MAINTENANCE_MODE === "true";
}

// The secret becomes a cookie value and is matched by Next's route matcher as
// a regular expression, so only accept characters with no regex meaning.
export function maintenanceBypassSecret(env: Env = process.env) {
  const secret = env.MAINTENANCE_BYPASS_SECRET ?? "";
  return /^[A-Za-z0-9_-]{32,128}$/.test(secret) ? secret : null;
}

export function maintenanceRewrites(env: Env = process.env) {
  if (!isMaintenanceMode(env)) return [];
  const secret = maintenanceBypassSecret(env);
  return [
    {
      // Everything except Next's own assets and the maintenance routes.
      source: "/:path((?!_next/|api/maintenance(?:/|$)).*)",
      destination: MAINTENANCE_PATH,
      ...(secret
        ? { missing: [{ type: "cookie" as const, key: MAINTENANCE_BYPASS_COOKIE, value: `^${secret}$` }] }
        : {})
    }
  ];
}
