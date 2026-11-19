"use client";

import { useState } from "react";
import { loadConnectAndInitialize } from "@stripe/connect-js";
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
  ConnectNotificationBanner
} from "@stripe/react-connect-js";
import { getOnlinePaymentsClientSecretAction } from "@/app/admin/settings/online-payments-actions";

/**
 * Stripe's embedded onboarding and notification banner for the restaurant's
 * own account. Loaded only on the settings page, never on customer pages.
 */
export function StripeEmbeddedOnboarding({
  mode,
  onExit,
  publishableKey
}: {
  mode: "onboarding" | "banner";
  onExit?: () => void;
  publishableKey: string;
}) {
  const [connectInstance] = useState(() =>
    loadConnectAndInitialize({
      publishableKey,
      fetchClientSecret: () => getOnlinePaymentsClientSecretAction(),
      appearance: {
        overlays: "dialog",
        variables: {
          colorPrimary: "#1f8a5b",
          borderRadius: "12px",
          fontFamily: "inherit"
        }
      }
    })
  );

  return (
    <ConnectComponentsProvider connectInstance={connectInstance}>
      <ConnectNotificationBanner />
      {mode === "onboarding" ? <ConnectAccountOnboarding onExit={() => onExit?.()} /> : null}
    </ConnectComponentsProvider>
  );
}
