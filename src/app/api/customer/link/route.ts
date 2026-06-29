// app/api/customer/link/route.ts
//
// Deep-link landing. The WhatsApp reply points the customer here:
//   /api/customer/link?token=<linkToken>&next=/r/<slug>
//
// Flow: verify the short-lived link token -> set the long-lived session cookie
// -> redirect into the menu. The customer never sees a login screen; this is
// the zero-tap path for someone arriving from chat.

import { NextRequest, NextResponse } from "next/server";
import { verifyLinkToken } from "@/lib/customer-auth/tokens";
import { setCustomerSession } from "@/lib/customer-auth/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Only allow same-origin relative redirects (prevents open-redirect abuse via
 * the `next` param). Must start with a single "/" and not "//".
 */
function safeNext(next: string | null): string {
  if (next && /^\/(?!\/)/.test(next)) return next;
  return "/";
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get("token");
  const next = safeNext(req.nextUrl.searchParams.get("next"));

  if (!token) {
    return NextResponse.redirect(new URL("/?auth=missing", req.nextUrl.origin));
  }

  try {
    const identity = await verifyLinkToken(token);
    await setCustomerSession(identity);
    // Clean redirect WITHOUT the token in the URL (so it can't be re-shared
    // or leak via history/referrer).
    return NextResponse.redirect(new URL(next, req.nextUrl.origin));
  } catch {
    // Expired or tampered link -> send to the café, let the PWA fall back to
    // the OTP identify flow.
    return NextResponse.redirect(new URL(`${next}?auth=expired`, req.nextUrl.origin));
  }
}
