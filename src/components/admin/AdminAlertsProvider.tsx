"use client";

import { NewOrderAlertsProvider } from "@/components/admin/NewOrderAlerts";
import type { NewOrderAlertState } from "@/lib/data";

export function AdminAlertsProvider({
  children,
  initialNewOrderAlertState,
  realtimeAccessToken,
  restaurantId
}: {
  children: React.ReactNode;
  initialNewOrderAlertState: NewOrderAlertState;
  realtimeAccessToken: string | null;
  restaurantId: string;
}) {
  return (
    <NewOrderAlertsProvider
      initialNewOrderAlertState={initialNewOrderAlertState}
      realtimeAccessToken={realtimeAccessToken}
      restaurantId={restaurantId}
    >
      {children}
    </NewOrderAlertsProvider>
  );
}
