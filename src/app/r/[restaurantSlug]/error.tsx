"use client";

import { RouteErrorState } from "@/components/shared/RouteErrorState";

export default function RestaurantError({ reset }: { reset: () => void }) {
  return (
    <RouteErrorState
      description="The restaurant menu could not be loaded. Check your connection and try again."
      reset={reset}
      title="Menu temporarily unavailable"
    />
  );
}
