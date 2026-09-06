import { NextResponse } from "next/server";
import { processOrderNotifications } from "@/lib/notification-jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await processOrderNotifications());
  } catch {
    return NextResponse.json({ error: "Notification worker failed" }, { status: 500 });
  }
}
