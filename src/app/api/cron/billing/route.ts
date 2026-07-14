import { NextResponse } from "next/server";
import { runDailyBilling } from "@/lib/billing-data";

// Daily billing cron (Feature Brief §9). Triggered by the Vercel cron schedule
// in vercel.json. Guarded by CRON_SECRET so only the scheduler (or an operator
// holding the secret) can run it. Fails closed if the secret is not configured.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runDailyBilling();
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Billing cron failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

// Vercel cron uses GET; POST is accepted for manual operator triggers.
export async function POST(request: Request) {
  return handle(request);
}
