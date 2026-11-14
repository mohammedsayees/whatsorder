import { NextResponse } from "next/server";
import { getUnreadChatConversationIds } from "@/lib/chat-inbox";
import { getRestaurantAdminSession } from "@/lib/super-admin-auth";

// Polled by the sidebar's unread-chat badge. A GET route keeps this background
// read out of the tab's server-action queue (see ../state/route.ts).
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

  const conversationIds =
    session.role === "staff"
      ? []
      : await getUnreadChatConversationIds(session.restaurantId);

  return NextResponse.json({ conversationIds }, { headers: privateResponseHeaders });
}
