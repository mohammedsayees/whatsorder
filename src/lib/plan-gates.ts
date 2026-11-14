// Plan entitlement gates for the staff/admin path (pricing v2). Never used on
// the customer ordering path: customer ordering is never gated by billing.

import "server-only";

import { redirect } from "next/navigation";

import { tenantHasFeature, type PlanFeatureFlag } from "@/lib/billing";
import { getTenantAccess } from "@/lib/billing-data";

export const GATED_FEATURE_LABELS: Partial<Record<PlanFeatureFlag, string>> = {
  campaigns: "Marketing & campaigns",
  chat_inbox: "WhatsApp chat inbox & AI replies",
  finance: "Finance & costing"
};

export function upgradeHref(flag: PlanFeatureFlag): string {
  return `/admin/upgrade?feature=${flag}`;
}

/** Whether the tenant's plan includes a feature. Throws if access can't be read. */
export async function planAllows(restaurantId: string, flag: PlanFeatureFlag): Promise<boolean> {
  return tenantHasFeature(await getTenantAccess(restaurantId), flag);
}

/** For background work (AI replies): fails closed — no paid work if unsure. */
export async function planAllowsOrFalse(
  restaurantId: string,
  flag: PlanFeatureFlag
): Promise<boolean> {
  try {
    return await planAllows(restaurantId, flag);
  } catch {
    return false;
  }
}

/** Page/action guard: redirects to the upgrade page when the plan lacks it. */
export async function requirePlanFeature(restaurantId: string, flag: PlanFeatureFlag): Promise<void> {
  if (!(await planAllows(restaurantId, flag))) {
    redirect(upgradeHref(flag));
  }
}

export function planUpgradeMessage(flag: PlanFeatureFlag): string {
  const label = GATED_FEATURE_LABELS[flag] ?? "This feature";
  return `${label} is included in the Growth plan. Upgrade to use it.`;
}
