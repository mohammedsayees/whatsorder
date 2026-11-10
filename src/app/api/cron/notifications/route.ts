import { NextResponse } from "next/server";
import { processOrderNotifications } from "@/lib/notification-jobs";
import { processCustomerCreditReminders } from "@/lib/customer-credit-reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [orders, customerCredit] = await Promise.all([
      processOrderNotifications(),
      processCustomerCreditReminders()
    ]);
    return NextResponse.json({ orders, customerCredit });
  } catch {
    return NextResponse.json({ error: "Notification worker failed" }, { status: 500 });
  }
}
