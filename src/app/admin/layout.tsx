import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { accessTokenCookieName } from "@/lib/auth-cookies";
import { getTenantAccess } from "@/lib/billing-data";
import { getUnreadChatConversationIds } from "@/lib/chat-inbox";
import { getNewOrderAlertState } from "@/lib/data";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRestaurantAdmin({ allowJobsOnly: true });
  const jobsOnly = session.restaurant.jobs_only === true;
  const pathname = (await headers()).get("x-whatsorder-pathname") ?? "/admin";

  const isJobsPath = pathname === "/admin/jobs" || pathname.startsWith("/admin/jobs/");
  if (jobsOnly && !isJobsPath) {
    redirect("/admin/jobs");
  }

  const [
    cookieStore,
    initialNewOrderAlertState,
    initialUnreadChatConversationIds,
    access
  ] = await Promise.all([
    cookies(),
    jobsOnly
      ? Promise.resolve({ newOrderCount: 0, pendingOrderIds: [] })
      : getNewOrderAlertState(session.restaurantId),
    jobsOnly || session.role === "staff"
      ? Promise.resolve([])
      : getUnreadChatConversationIds(session.restaurantId),
    jobsOnly ? Promise.resolve({ status: null }) : getTenantAccess(session.restaurantId)
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
