import { cookies } from "next/headers";
import { AdminShell } from "@/components/admin/AdminShell";
import { accessTokenCookieName } from "@/lib/auth-cookies";
import { getTenantAccess } from "@/lib/billing-data";
import { getNewOrderAlertState } from "@/lib/data";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRestaurantAdmin();
  const [cookieStore, initialNewOrderAlertState, access] = await Promise.all([
    cookies(),
    getNewOrderAlertState(session.restaurantId),
    getTenantAccess(session.restaurantId)
  ]);
  const realtimeAccessToken = cookieStore.get(accessTokenCookieName)?.value ?? null;

  return (
    <AdminShell
      billingStatus={access.status}
      initialNewOrderAlertState={initialNewOrderAlertState}
      realtimeAccessToken={realtimeAccessToken}
      session={session}
    >
      {children}
    </AdminShell>
  );
}
