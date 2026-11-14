"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { OrderStatus } from "@/lib/types";

// A status change is a server action followed by a re-render of the orders
// page. Until that lands, the card shows the status staff just chose so a tap
// is acknowledged immediately. The override is dropped when the action
// settles: on success the refreshed page already carries the new status, and
// on failure the card falls back to the last saved one.
type OptimisticOrderStatusContextValue = {
  statusFor: (orderId: string) => OrderStatus | undefined;
  setPendingStatus: (orderId: string, status: OrderStatus | null) => void;
};

const OptimisticOrderStatusContext = createContext<OptimisticOrderStatusContextValue>({
  statusFor: () => undefined,
  setPendingStatus: () => undefined
});

export function OptimisticOrderStatusProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Record<string, OrderStatus>>({});

  const setPendingStatus = useCallback((orderId: string, status: OrderStatus | null) => {
    setPending((current) => {
      if (status === null) {
        if (!(orderId in current)) return current;
        const next = { ...current };
        delete next[orderId];
        return next;
      }
      return { ...current, [orderId]: status };
    });
  }, []);

  const value = useMemo(
    () => ({
      statusFor: (orderId: string) => pending[orderId],
      setPendingStatus
    }),
    [pending, setPendingStatus]
  );

  return (
    <OptimisticOrderStatusContext.Provider value={value}>
      {children}
    </OptimisticOrderStatusContext.Provider>
  );
}

export function useSetPendingOrderStatus() {
  return useContext(OptimisticOrderStatusContext).setPendingStatus;
}

export function OrderStatusBadge({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const pendingStatus = useContext(OptimisticOrderStatusContext).statusFor(orderId);
  return <StatusBadge status={pendingStatus ?? status} />;
}
