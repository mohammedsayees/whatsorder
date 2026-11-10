import "server-only";

const PRODUCTION_APP_URL = "https://whatsorder-taupe.vercel.app";

export function publicAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;

  const vercelUrl =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return vercelUrl ? `https://${vercelUrl}` : PRODUCTION_APP_URL;
}
