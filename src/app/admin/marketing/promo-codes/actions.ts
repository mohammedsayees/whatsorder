"use server";

import { revalidatePath } from "next/cache";
import { isManagementBlocked, tenantHasFeature } from "@/lib/billing";
import { getTenantAccess } from "@/lib/billing-data";
import { planUpgradeMessage } from "@/lib/plan-gates";
import { parsePromoCodeForm } from "@/lib/promo-code-form";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

export type PromoCodeActionState = {
  error?: string;
  success?: string;
};

const PROMO_PATH = "/admin/marketing/promo-codes";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Owners/managers on a plan with Marketing (Growth) only. Writes go through
// the service-role client and are always scoped to the session's restaurant.
async function promoContext() {
  const session = await requireRestaurantRole(["restaurant_admin", "owner", "manager"]);
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { error: "Promo codes are unavailable right now." } as const;
  }
  const access = await getTenantAccess(session.restaurantId);
  if (isManagementBlocked(access.access)) {
    return { error: "Your subscription needs attention before you can change promo codes." } as const;
  }
  if (!tenantHasFeature(access, "campaigns")) {
    return { error: planUpgradeMessage("campaigns") } as const;
  }
  return { session, supabase } as const;
}

export async function createPromoCodeAction(
  _previous: PromoCodeActionState,
  formData: FormData
): Promise<PromoCodeActionState> {
  const context = await promoContext();
  if ("error" in context) {
    return { error: context.error };
  }
  const { session, supabase } = context;

  const parsed = parsePromoCodeForm(formData, session.restaurant);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const { error } = await supabase.from("promo_codes").insert({
    ...parsed.value,
    restaurant_id: session.restaurantId,
    created_by: session.userId
  });

  if (error) {
    if (error.code === "23505") {
      return { error: `${parsed.value.code} already exists. Choose another code.` };
    }
    console.error("WhatsOrder promo code create failed", { code: error.code, restaurantId: session.restaurantId });
    return { error: "The promo code could not be saved. Please try again." };
  }

  revalidatePath(PROMO_PATH);
  return { success: `${parsed.value.code} is live.` };
}

export async function setPromoCodeActiveAction(formData: FormData): Promise<PromoCodeActionState> {
  const context = await promoContext();
  if ("error" in context) {
    return { error: context.error };
  }
  const { session, supabase } = context;
  const id = String(formData.get("id") ?? "");
  if (!UUID_PATTERN.test(id)) {
    return { error: "Promo code not found." };
  }

  const isActive = formData.get("is_active") === "true";
  const { error } = await supabase
    .from("promo_codes")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("restaurant_id", session.restaurantId)
    .eq("id", id);

  if (error) {
    return { error: "The promo code could not be updated. Please try again." };
  }

  revalidatePath(PROMO_PATH);
  return { success: isActive ? "Promo code turned on." : "Promo code turned off." };
}

// Only unused codes can be deleted; used codes keep their redemption history
// (the database refuses the delete) and are turned off instead.
export async function deletePromoCodeAction(formData: FormData): Promise<PromoCodeActionState> {
  const context = await promoContext();
  if ("error" in context) {
    return { error: context.error };
  }
  const { session, supabase } = context;
  const id = String(formData.get("id") ?? "");
  if (!UUID_PATTERN.test(id)) {
    return { error: "Promo code not found." };
  }

  const { error } = await supabase
    .from("promo_codes")
    .delete()
    .eq("restaurant_id", session.restaurantId)
    .eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return { error: "This code has been used, so it can't be deleted. Turn it off instead." };
    }
    return { error: "The promo code could not be deleted. Please try again." };
  }

  revalidatePath(PROMO_PATH);
  return { success: "Promo code deleted." };
}
