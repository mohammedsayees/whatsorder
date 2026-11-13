import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

export const onboardingEventNames = [
  "demo_built",
  "menu_reviewed",
  "claim_viewed",
  "restaurant_claimed",
  "dashboard_opened",
  "test_order_started",
  "test_order_accepted",
  "qr_opened"
] as const;

export type OnboardingEventName = (typeof onboardingEventNames)[number];

export async function recordOnboardingEvent(
  restaurantId: string,
  eventName: OnboardingEventName,
  eventSource: string
): Promise<void> {
  const admin = getSupabaseAdmin();
  const safeSource = eventSource.trim().slice(0, 40);

  if (!admin || !restaurantId || !safeSource) {
    return;
  }

  const { error } = await admin
    .from("onboarding_funnel_events")
    .upsert(
      {
        restaurant_id: restaurantId,
        event_name: eventName,
        event_source: safeSource,
        metadata: {}
      },
      { onConflict: "restaurant_id,event_name", ignoreDuplicates: true }
    );

  if (error) {
    // Funnel measurement must never block ordering, claiming, or admin work.
    console.error("WhatsOrder onboarding event could not be recorded", {
      eventName,
      restaurantId,
      message: error.message
    });
  }
}
