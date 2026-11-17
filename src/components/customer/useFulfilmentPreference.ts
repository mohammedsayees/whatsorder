"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  availableFulfilmentTypes,
  fulfilmentStorageKey,
  resolveFulfilmentType
} from "@/lib/customer-fulfilment";
import type { FulfilmentType, PublicRestaurant } from "@/lib/types";

/**
 * The customer's delivery / pickup / car / dine-in choice, shared by the menu
 * and checkout through per-store localStorage. The first render uses the
 * deterministic default so cached menu HTML hydrates cleanly; the saved
 * choice is applied after mount.
 */
export function useFulfilmentPreference(
  restaurant: Pick<
    PublicRestaurant,
    "slug" | "delivery_enabled" | "pickup_enabled" | "car_pickup_enabled" | "dine_in_enabled"
  >,
  tableNumber: string
) {
  const { slug, delivery_enabled, pickup_enabled, car_pickup_enabled, dine_in_enabled } =
    restaurant;
  const available = useMemo(
    () =>
      availableFulfilmentTypes({
        delivery_enabled,
        pickup_enabled,
        car_pickup_enabled,
        dine_in_enabled
      }),
    [delivery_enabled, pickup_enabled, car_pickup_enabled, dine_in_enabled]
  );
  const storageKey = fulfilmentStorageKey(slug);
  const [fulfilmentType, setFulfilmentTypeState] = useState<FulfilmentType>(() =>
    resolveFulfilmentType({ available, stored: null, tableNumber })
  );

  useEffect(() => {
    let stored: string | null = null;

    try {
      stored = window.localStorage.getItem(storageKey);
    } catch {
      // Storage can be blocked; the default mode still works.
    }

    setFulfilmentTypeState(resolveFulfilmentType({ available, stored, tableNumber }));
  }, [available, storageKey, tableNumber]);

  const setFulfilmentType = useCallback(
    (next: FulfilmentType) => {
      setFulfilmentTypeState(next);

      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // Keep the in-memory choice when storage is unavailable.
      }
    },
    [storageKey]
  );

  return { available, fulfilmentType, setFulfilmentType };
}
