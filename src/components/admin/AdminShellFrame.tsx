"use client";

import { usePathname } from "next/navigation";
import { AdminAlertsProvider } from "@/components/admin/AdminAlertsProvider";
import { BillingBanner } from "@/components/admin/BillingBanner";
import { isAdminPosPathname } from "@/lib/admin-shell";
import type { SubscriptionStatus } from "@/lib/billing";
import type { NewOrderAlertState } from "@/lib/data";

export function AdminShellFrame({
  billingHref,
  billingStatus,
  children,
  initialNewOrderAlertState,
  jobsOnly,
  realtimeAccessToken,
  restaurantId,
  sidebar
}: {
  billingHref?: string | null;
  billingStatus?: SubscriptionStatus | null;
  children: React.ReactNode;
  initialNewOrderAlertState: NewOrderAlertState;
  jobsOnly: boolean;
  realtimeAccessToken: string | null;
  restaurantId: string;
  sidebar: React.ReactNode;
}) {
  const pathname = usePathname();
  // App Router layouts persist during client navigation. Deriving this from
  // the live pathname makes POS mode respond when staff click New order, not
  // only when they reload that URL directly.
  const posMode = isAdminPosPathname(pathname);

  return (
    <div className="min-h-screen bg-stone-50">
      <div className={posMode ? "hidden" : undefined}>{sidebar}</div>
      <div className={`${posMode ? "pb-0 lg:pl-0" : "pb-24 lg:pb-0 lg:pl-64"} print:pb-0 lg:print:pl-0`}>
        {jobsOnly ? children : (
          <AdminAlertsProvider
            compact={posMode}
            initialNewOrderAlertState={initialNewOrderAlertState}
            realtimeAccessToken={realtimeAccessToken}
            restaurantId={restaurantId}
          >
            <BillingBanner billingHref={billingHref} status={billingStatus ?? null} />
            {children}
          </AdminAlertsProvider>
        )}
      </div>
    </div>
  );
}
