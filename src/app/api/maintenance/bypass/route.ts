import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  MAINTENANCE_BYPASS_COOKIE,
  isMaintenanceMode,
  maintenanceBypassSecret
} from "@/lib/maintenance-config";

// Operator bypass while MAINTENANCE_MODE is on: /api/maintenance/bypass?token=<secret>
// sets an httpOnly cookie that the maintenance rewrite skips, so the app can be
// checked against the new database before customers are let back in.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BYPASS_MAX_AGE_SECONDS = 4 * 60 * 60;

function matches(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const secret = maintenanceBypassSecret();
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!isMaintenanceMode() || !secret || !matches(token, secret)) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(MAINTENANCE_BYPASS_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: BYPASS_MAX_AGE_SECONDS
  });
  return response;
}
