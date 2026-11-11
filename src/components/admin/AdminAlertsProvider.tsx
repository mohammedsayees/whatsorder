"use client";

import { NewOrderAlertsProvider } from "@/components/admin/NewOrderAlerts";
import type { NewOrderAlertState } from "@/lib/data";

export function AdminAlertsProvider({
  children,
  compact = false,
  initialNewOrderAlertState,
  realtimeAccessToken,
  restaurantId
}: {
  children: React.ReactNode;
  compact?: boolean;
  initialNewOrderAlertState: NewOrderAlertState;
  realtimeAccessToken: string | null;
  restaurantId: string;
}) {
  return (
    <NewOrderAlertsProvider
      compact={compact}
      initialNewOrderAlertState={initialNewOrderAlertState}
      realtimeAccessToken={realtimeAccessToken}
      restaurantId={restaurantId}
    >
      {children}
    </NewOrderAlertsProvider>
  );
}
