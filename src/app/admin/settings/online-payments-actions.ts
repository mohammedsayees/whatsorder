"use server";

import { revalidatePath } from "next/cache";
import { supportsOnlinePayments } from "@/lib/stripe/connect";
import {
  StripeConnectError,
  connectRestaurantAccount,
  createOnboardingClientSecret,
  syncRestaurantStripeAccount
} from "@/lib/stripe/connect-data";
import { isStripeConfigured } from "@/lib/stripe/server";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

// Online payments (Stripe Connect). Only the owner or restaurant admin may
// connect the restaurant's own Stripe account; every call acts on the
// session restaurant only.

const MANAGERS = ["owner", "restaurant_admin"] as const;

export type OnlinePaymentsActionState = { error?: string };

function message(error: unknown) {
  if (error instanceof StripeConnectError) {
    return error.code === "not_configured"
      ? "Online payments aren't available on this WhatsOrder installation yet."
      : "Stripe couldn't be reached. Please try again in a moment.";
  }

  return "Stripe couldn't set up the account. Please try again in a moment.";
}

export async function startOnlinePaymentsAction(
  _previous: OnlinePaymentsActionState
): Promise<OnlinePaymentsActionState> {
  const session = await requireRestaurantRole([...MANAGERS]);

  if (!isStripeConfigured()) {
    return { error: message(new StripeConnectError("not_configured")) };
  }

  if (!supportsOnlinePayments(session.restaurant.country_code)) {
    return { error: "Online payments are available for UAE restaurants for now." };
  }

  try {
    await connectRestaurantAccount({
      restaurantId: session.restaurantId,
      restaurantName: session.restaurant.name,
      contactEmail: session.email || null,
      userId: session.userId
    });
  } catch (error) {
    console.error("Stripe connect failed", {
      restaurantId: session.restaurantId,
      message: error instanceof Error ? error.message : "unknown"
    });
    return { error: message(error) };
  }

  revalidatePath("/admin/settings");
  return {};
}

/** Called by Stripe's embedded components to start or resume onboarding. */
export async function getOnlinePaymentsClientSecretAction(): Promise<string> {
  const session = await requireRestaurantRole([...MANAGERS]);
  return createOnboardingClientSecret(session.restaurantId);
}

/** Refreshes the stored status after the owner leaves onboarding. */
export async function refreshOnlinePaymentsStatusAction(): Promise<void> {
  const session = await requireRestaurantRole([...MANAGERS]);

  try {
    await syncRestaurantStripeAccount(session.restaurantId);
  } catch {
    // The settings page keeps showing the last known status.
  }

  revalidatePath("/admin/settings");
}
