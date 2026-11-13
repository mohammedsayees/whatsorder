"use server";

import { recordOnboardingEvent } from "@/lib/onboarding-events";
import { getRestaurantAdminSession } from "@/lib/super-admin-auth";

export async function recordTestOrderStartedAction(
  expectedRestaurantId: string
): Promise<void> {
  const session = await getRestaurantAdminSession();
  if (!session || session.restaurantId !== expectedRestaurantId) {
    return;
  }
  await recordOnboardingEvent(
    session.restaurantId,
    "test_order_started",
    "customer_menu_guide"
  );
}
