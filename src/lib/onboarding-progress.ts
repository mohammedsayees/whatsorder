import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import type { OnboardingProgress, OnboardingTask } from "@/lib/types";

export type LaunchMilestoneState = {
  storeReady: boolean;
  testOrderComplete: boolean;
  storeShared: boolean;
};

export function getLaunchMilestoneState(
  progress: OnboardingProgress
): LaunchMilestoneState {
  const completed = new Set(
    progress.tasks
      .filter((task) => task.is_completed)
      .map((task) => task.task_key)
  );

  return {
    storeReady: [
      "restaurant_details",
      "whatsapp_number",
      "menu_uploaded",
      "restaurant_live"
    ].every((taskKey) => completed.has(taskKey)),
    testOrderComplete:
      Boolean(progress.activatedAt) || completed.has("test_order"),
    storeShared: completed.has("qr_generated")
  };
}

export async function getOnboardingProgress(
  restaurantId: string
): Promise<OnboardingProgress> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      tasks: [],
      completed: 0,
      total: 0,
      activatedAt: null,
      activationOrderId: null
    };
  }

  const [{ data: tasks, error: taskError }, { data: restaurant, error: restaurantError }] =
    await Promise.all([
      admin
        .from("onboarding_tasks")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("created_at"),
      admin
        .from("restaurants")
        .select("activated_at,activation_order_id")
        .eq("id", restaurantId)
        .maybeSingle()
    ]);

  if (taskError || restaurantError) {
    throw new Error("Onboarding progress could not be loaded.");
  }

  const scopedTasks = (tasks ?? []) as OnboardingTask[];
  return {
    tasks: scopedTasks,
    completed: scopedTasks.filter((task) => task.is_completed).length,
    total: scopedTasks.length,
    activatedAt: restaurant?.activated_at ? String(restaurant.activated_at) : null,
    activationOrderId: restaurant?.activation_order_id
      ? String(restaurant.activation_order_id)
      : null
  };
}

// Marks onboarding tasks done for one tenant. Idempotent: only open tasks
// are touched, so the original completion time is kept. Best-effort by
// design — a checklist tick must never break the page or action calling it.
export async function markOnboardingTasksComplete(
  restaurantId: string,
  taskKeys: string[]
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin || !restaurantId || taskKeys.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from("onboarding_tasks")
    .update({ is_completed: true, completed_at: now, updated_at: now })
    .eq("restaurant_id", restaurantId)
    .in("task_key", taskKeys)
    .eq("is_completed", false);

  if (error) {
    console.error("WhatsOrder onboarding task update failed", {
      restaurantId,
      taskKeys,
      message: error.message
    });
  }
}
