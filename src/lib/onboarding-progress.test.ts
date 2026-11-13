import { describe, expect, it } from "vitest";

import { getLaunchMilestoneState } from "@/lib/onboarding-progress";
import type { OnboardingProgress, OnboardingTask } from "@/lib/types";

function progress(
  completedKeys: string[],
  activatedAt: string | null = null
): OnboardingProgress {
  const tasks = [
    "restaurant_details",
    "whatsapp_number",
    "menu_uploaded",
    "restaurant_live",
    "test_order",
    "qr_generated"
  ].map(
    (taskKey, index) =>
      ({
        id: String(index),
        restaurant_id: "restaurant-1",
        task_key: taskKey,
        task_label: taskKey,
        is_completed: completedKeys.includes(taskKey),
        completed_at: completedKeys.includes(taskKey) ? "2026-11-13T00:00:00Z" : null,
        created_at: "2026-11-13T00:00:00Z",
        updated_at: "2026-11-13T00:00:00Z"
      }) satisfies OnboardingTask
  );

  return {
    tasks,
    completed: completedKeys.length,
    total: tasks.length,
    activatedAt,
    activationOrderId: null
  };
}

describe("launch milestone state", () => {
  it("requires the core claimed-store tasks before calling the store ready", () => {
    expect(
      getLaunchMilestoneState(
        progress(["restaurant_details", "whatsapp_number", "menu_uploaded"])
      ).storeReady
    ).toBe(false);

    expect(
      getLaunchMilestoneState(
        progress([
          "restaurant_details",
          "whatsapp_number",
          "menu_uploaded",
          "restaurant_live"
        ])
      ).storeReady
    ).toBe(true);
  });

  it("recognizes activation and QR generation as owner outcomes", () => {
    const state = getLaunchMilestoneState(
      progress(["qr_generated"], "2026-11-13T01:00:00Z")
    );

    expect(state.testOrderComplete).toBe(true);
    expect(state.storeShared).toBe(true);
  });
});
