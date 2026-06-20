"use client";

import { RouteErrorState } from "@/components/shared/RouteErrorState";

export default function SuperAdminError({ reset }: { reset: () => void }) {
  return (
    <RouteErrorState
      description="Portfolio data could not be loaded. No restaurant settings were changed."
      reset={reset}
      title="Super Admin data unavailable"
    />
  );
}
