import { NextResponse } from "next/server";
import { getNewOrderAlertState } from "@/lib/data";
import { scheduleOrderNotifications } from "@/lib/notification-jobs";
import { getRestaurantAdminSession } from "@/lib/super-admin-auth";

// Polled by the dashboard's new-order alerts. This is a GET route rather than
// a server action because Next.js runs a tab's server actions one at a time:
// a background poll would otherwise hold up the status button staff just
// tapped.
export const dynamic = "force-dynamic";

const privateResponseHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  const session = await getRestaurantAdminSession();

  if (!session || session.restaurant.jobs_only) {
    return NextResponse.json(
      { error: "not_authenticated" },
      { status: 401, headers: privateResponseHeaders }
    );
  }

  scheduleOrderNotifications(session.restaurantId);
  const state = await getNewOrderAlertState(session.restaurantId);

  return NextResponse.json(state, { headers: privateResponseHeaders });
}
