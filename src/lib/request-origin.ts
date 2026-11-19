import "server-only";

import { headers } from "next/headers";
import { publicAppUrl } from "@/lib/public-app-url";

/**
 * Origin of the current request, for Stripe return URLs: the user must come
 * back to the same host (preview or production), where their cookies live.
 */
export async function requestOrigin() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
  return host && /^[a-z0-9.-]+(:\d+)?$/i.test(host)
    ? `${proto === "http" ? "http" : "https"}://${host}`
    : publicAppUrl();
}
