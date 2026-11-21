// app/api/auth/whatsapp-otp-hook/route.ts
//
// Supabase Auth "Send SMS" hook. Supabase calls this with the phone and the
// code it generated; we deliver the code on WhatsApp instead of SMS. Only
// requests WhatsOrder reserved itself are sent (see handleSendSmsHook).
// Fails closed: no secret, a bad signature or an unknown request -> nothing
// is sent.

import { NextRequest, NextResponse } from "next/server";
import { verifyStandardWebhook } from "@/lib/owner-whatsapp-login/hook-signature";
import { handleSendSmsHook } from "@/lib/owner-whatsapp-login/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hookError(status: number, message: string) {
  // Shape Supabase Auth hooks expect for an error response.
  return NextResponse.json({ error: { http_code: status, message } }, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const signed = verifyStandardWebhook({
    body: rawBody,
    id: req.headers.get("webhook-id"),
    timestamp: req.headers.get("webhook-timestamp"),
    signature: req.headers.get("webhook-signature"),
    secret: process.env.SUPABASE_SEND_SMS_HOOK_SECRET
  });
  if (!signed) {
    return hookError(401, "Invalid hook signature");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return hookError(400, "Invalid JSON");
  }

  const result = await handleSendSmsHook(payload);
  if (!result.ok) {
    return hookError(result.status, result.message);
  }
  return NextResponse.json({});
}
