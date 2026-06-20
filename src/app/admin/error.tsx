"use client";

import { RouteErrorState } from "@/components/shared/RouteErrorState";

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <RouteErrorState
      description="Dashboard data could not be refreshed. Existing orders remain stored. Retry, and use the restaurant WhatsApp as the fallback if the issue continues."
      reset={reset}
      title="Dashboard refresh failed"
    />
  );
}
