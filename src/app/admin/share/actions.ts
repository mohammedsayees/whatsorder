"use server";

import { revalidatePath } from "next/cache";

import { recordOnboardingEvent } from "@/lib/onboarding-events";
import { markOnboardingTasksComplete } from "@/lib/onboarding-progress";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

const shareActions = [
  "link_copied",
  "qr_downloaded",
  "whatsapp_shared",
  "qr_printed"
] as const;

export type StoreShareAction = (typeof shareActions)[number];

export async function recordStoreShareAction(
  expectedRestaurantId: string,
  shareAction: StoreShareAction
): Promise<void> {
  const session = await requireRestaurantRole([
    "owner",
    "restaurant_admin",
    "manager"
  ]);

  if (
    session.restaurantId !== expectedRestaurantId ||
    !shareActions.includes(shareAction)
  ) {
    throw new Error("This store-sharing action is not allowed.");
  }

  await Promise.all([
    markOnboardingTasksComplete(session.restaurantId, ["qr_generated"]),
    recordOnboardingEvent(
      session.restaurantId,
      "qr_opened",
      `store_share_${shareAction}`
    )
  ]);
  revalidatePath("/admin");
}
