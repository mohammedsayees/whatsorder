"use server";

import { revalidatePath } from "next/cache";
import { isManagementBlocked, tenantHasFeature } from "@/lib/billing";
import { getTenantAccess } from "@/lib/billing-data";
import { planUpgradeMessage } from "@/lib/plan-gates";
import { parsePromoCodeForm } from "@/lib/promo-code-form";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantRole } from "@/lib/super-admin-auth";
import {
  listCodeRecipients,
  searchRestaurantCustomers
} from "@/lib/promo-assignment-data";
import {
  cleanCustomerSearch,
  MAX_ASSIGNMENTS_PER_CODE,
  type VoucherRecipient
} from "@/lib/promo-assignments";

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

// Whether signed-in customers see this code on their account page and as a
// one-tap voucher at checkout. Redemption rules are unchanged either way.
export async function setPromoCodeVisibilityAction(formData: FormData): Promise<PromoCodeActionState> {
  const context = await promoContext();
  if ("error" in context) {
    return { error: context.error };
  }
  const { session, supabase } = context;
  const id = String(formData.get("id") ?? "");
  if (!UUID_PATTERN.test(id)) {
    return { error: "Promo code not found." };
  }

  const showInAccount = formData.get("show_in_account") === "true";
  const { error } = await supabase
    .from("promo_codes")
    .update({ show_in_account: showInAccount, updated_at: new Date().toISOString() })
    .eq("restaurant_id", session.restaurantId)
    .eq("id", id);

  if (error) {
    return { error: "The promo code could not be updated. Please try again." };
  }

  revalidatePath(PROMO_PATH);
  return {
    success: showInAccount
      ? "Signed-in customers can now see this code."
      : "This code is hidden from customers again."
  };
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

// ── Personal vouchers ───────────────────────────────────────────────────────
// Owners choose which customers may use an "assigned" code. The database
// refuses the code for anyone else at checkout (trigger on redemptions).

export type RecipientsResult =
  | { ok: true; recipients: VoucherRecipient[] }
  | { ok: false; error: string };

async function assignedCode(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  restaurantId: string,
  promoCodeId: string
) {
  if (!UUID_PATTERN.test(promoCodeId)) {
    return null;
  }
  const { data } = await supabase
    .from("promo_codes")
    .select("id, audience")
    .eq("restaurant_id", restaurantId)
    .eq("id", promoCodeId)
    .maybeSingle();
  return data && (data as { audience?: string }).audience === "assigned" ? data : null;
}

export async function listPromoRecipientsAction(promoCodeId: string): Promise<RecipientsResult> {
  const context = await promoContext();
  if ("error" in context) {
    return { ok: false, error: context.error ?? "Promo codes are unavailable right now." };
  }
  const { session, supabase } = context;
  const restaurantId = session.restaurantId;
  if (!restaurantId) {
    return { ok: false, error: "Promo code not found." };
  }
  if (!(await assignedCode(supabase, restaurantId, promoCodeId))) {
    return { ok: false, error: "Promo code not found." };
  }
  try {
    return { ok: true, recipients: await listCodeRecipients(supabase, restaurantId, promoCodeId) };
  } catch {
    return { ok: false, error: "Recipients could not be loaded. Please try again." };
  }
}

export async function searchPromoRecipientsAction(query: string): Promise<RecipientsResult> {
  const context = await promoContext();
  if ("error" in context) {
    return { ok: false, error: context.error ?? "Promo codes are unavailable right now." };
  }
  const restaurantId = context.session.restaurantId;
  const search = cleanCustomerSearch(query);
  if (!search || !restaurantId) {
    return { ok: true, recipients: [] };
  }
  try {
    return {
      ok: true,
      recipients: await searchRestaurantCustomers(context.supabase, restaurantId, search)
    };
  } catch {
    return { ok: false, error: "Customers could not be searched. Please try again." };
  }
}

export async function assignPromoRecipientAction(
  promoCodeId: string,
  customerId: string
): Promise<RecipientsResult> {
  const context = await promoContext();
  if ("error" in context) {
    return { ok: false, error: context.error ?? "Promo codes are unavailable right now." };
  }
  const { session, supabase } = context;
  const restaurantId = session.restaurantId;
  if (!restaurantId) {
    return { ok: false, error: "Promo code not found." };
  }
  if (!UUID_PATTERN.test(customerId) || !(await assignedCode(supabase, restaurantId, promoCodeId))) {
    return { ok: false, error: "Promo code or customer not found." };
  }

  const { count } = await supabase
    .from("promo_code_assignments")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("promo_code_id", promoCodeId);
  if ((count ?? 0) >= MAX_ASSIGNMENTS_PER_CODE) {
    return { ok: false, error: `A personal code can go to at most ${MAX_ASSIGNMENTS_PER_CODE} customers.` };
  }

  // The composite FK refuses a customer from another restaurant.
  const { error } = await supabase.from("promo_code_assignments").insert({
    restaurant_id: restaurantId,
    promo_code_id: promoCodeId,
    customer_id: customerId,
    created_by: session.userId
  });
  if (error && error.code !== "23505") {
    if (error.code !== "23503") {
      console.error("WhatsOrder promo assignment failed", { code: error.code, restaurantId: restaurantId });
    }
    return { ok: false, error: "The customer could not be added. Please try again." };
  }

  revalidatePath(PROMO_PATH);
  return listPromoRecipientsAction(promoCodeId);
}

export async function removePromoRecipientAction(
  promoCodeId: string,
  customerId: string
): Promise<RecipientsResult> {
  const context = await promoContext();
  if ("error" in context) {
    return { ok: false, error: context.error ?? "Promo codes are unavailable right now." };
  }
  const { session, supabase } = context;
  const restaurantId = session.restaurantId;
  if (!restaurantId) {
    return { ok: false, error: "Promo code not found." };
  }
  if (!UUID_PATTERN.test(customerId) || !(await assignedCode(supabase, restaurantId, promoCodeId))) {
    return { ok: false, error: "Promo code or customer not found." };
  }

  const { error } = await supabase
    .from("promo_code_assignments")
    .delete()
    .eq("restaurant_id", restaurantId)
    .eq("promo_code_id", promoCodeId)
    .eq("customer_id", customerId);
  if (error) {
    return { ok: false, error: "The customer could not be removed. Please try again." };
  }

  revalidatePath(PROMO_PATH);
  return listPromoRecipientsAction(promoCodeId);
}
