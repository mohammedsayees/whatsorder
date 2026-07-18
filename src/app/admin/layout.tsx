import { cookies } from "next/headers";
import { AdminShell } from "@/components/admin/AdminShell";
import { accessTokenCookieName } from "@/lib/auth-cookies";
import { getTenantAccess } from "@/lib/billing-data";
import { getUnreadChatConversationIds } from "@/lib/chat-inbox";
import { getNewOrderAlertState } from "@/lib/data";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRestaurantAdmin();
  const [
    cookieStore,
    initialNewOrderAlertState,
    initialUnreadChatConversationIds,
    access
  ] = await Promise.all([
    cookies(),
    getNewOrderAlertState(session.restaurantId),
    session.role === "staff"
      ? Promise.resolve([])
      : getUnreadChatConversationIds(session.restaurantId),
    getTenantAccess(session.restaurantId)
  ]);
  const realtimeAccessToken = cookieStore.get(accessTokenCookieName)?.value ?? null;

  return (
    <AdminShell
      billingStatus={access.status}
      initialNewOrderAlertState={initialNewOrderAlertState}
      initialUnreadChatConversationIds={initialUnreadChatConversationIds}
      realtimeAccessToken={realtimeAccessToken}
      session={session}
    >
      {children}
    </AdminShell>
  );
}
