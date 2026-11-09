import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import type { OnboardingProgress, OnboardingTask } from "@/lib/types";

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
