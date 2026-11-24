"use server";

import { revalidatePath } from "next/cache";
import { formatCurrency } from "@/lib/currency";
import { getRiderBalance } from "@/lib/rider-cash-data";
import { parseMoneyAmount, planRiderSettlement } from "@/lib/rider-cash";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

// Rider cash ledger writes. Any signed-in staff member can hand a rider
// change or receive cash back; recording a settlement difference (rider short
// or over) needs restaurant management. Every entry stores who made it.

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MANAGEMENT_ROLES = ["restaurant_admin", "owner", "manager"];

export type RiderCashState = { error?: string; success?: string };

function field(formData: FormData, key: string, maxLength: number) {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

async function ownRider(restaurantId: string, riderId: string) {
  const admin = getSupabaseAdmin();

  if (!admin || !UUID_PATTERN.test(riderId)) {
    return null;
  }

  const { data, error } = await admin
    .from("delivery_riders")
    .select("id,name")
    .eq("id", riderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  return error || !data ? null : (data as { id: string; name: string });
}

export async function giveRiderFloatAction(
  _previous: RiderCashState,
  formData: FormData
): Promise<RiderCashState> {
  const session = await requireRestaurantAdmin();
  const admin = getSupabaseAdmin();
  const amount = parseMoneyAmount(field(formData, "amount", 12));
  const rider = await ownRider(session.restaurantId, field(formData, "rider_id", 80));

  if (!admin) return { error: "Rider cash is unavailable." };
  if (!rider) return { error: "Choose a rider from your directory." };
  if (!amount || amount <= 0) return { error: "Enter the cash amount you are giving the rider." };

  const { error } = await admin.from("rider_cash_entries").insert({
    restaurant_id: session.restaurantId,
    rider_id: rider.id,
    entry_type: "float_issued",
    amount,
    note: field(formData, "note", 300) || null,
    actor_user_id: session.userId,
    actor_role: session.role
  });

  if (error) return { error: "The cash could not be recorded. Please try again." };

  revalidatePath("/admin/riders");
  return { success: `Recorded ${formatCurrency(amount, session.restaurant)} given to ${rider.name}.` };
}

export async function receiveRiderCashAction(
  _previous: RiderCashState,
  formData: FormData
): Promise<RiderCashState> {
  const session = await requireRestaurantAdmin();
  const admin = getSupabaseAdmin();
  const rider = await ownRider(session.restaurantId, field(formData, "rider_id", 80));
  const handedOver = parseMoneyAmount(field(formData, "amount", 12) || "0");
  const settleInFull = formData.get("settle") === "on";
  const note = field(formData, "note", 300);

  if (!admin) return { error: "Rider cash is unavailable." };
  if (!rider) return { error: "Choose a rider from your directory." };
  if (handedOver === null) return { error: "Enter the cash the rider handed over." };

  const balance = await getRiderBalance(session.restaurantId, rider.id);
  const plan = planRiderSettlement({ balance, handedOver, settleInFull });

  if (!plan) return { error: "Enter the cash the rider handed over." };

  if (!settleInFull && handedOver > balance) {
    return {
      error: "That is more than the rider should be holding. Tick “Settle in full” to record the difference."
    };
  }

  const hasDifference = plan.entries.some((entry) => entry.entry_type === "variance");

  if (hasDifference) {
    if (!MANAGEMENT_ROLES.includes(session.role)) {
      return { error: "Only a manager can record a cash difference. Ask a manager to settle this rider." };
    }

    if (!note) return { error: "Add a note explaining the difference." };
  }

  const { error } = await admin.from("rider_cash_entries").insert(
    plan.entries.map((entry) => ({
      restaurant_id: session.restaurantId,
      rider_id: rider.id,
      entry_type: entry.entry_type,
      amount: entry.amount,
      note: note || null,
      actor_user_id: session.userId,
      actor_role: session.role
    }))
  );

  if (error) return { error: "The cash could not be recorded. Please try again." };

  revalidatePath("/admin/riders");
  revalidatePath("/admin/shifts");

  const money = (value: number) => formatCurrency(value, session.restaurant);

  return {
    success: hasDifference
      ? `${rider.name} settled with a difference of ${money(Math.abs(plan.shortfall))} ${plan.shortfall > 0 ? "short" : "over"}.`
      : plan.remaining === 0
        ? `${rider.name} is settled.`
        : `Received. ${rider.name} still holds ${money(plan.remaining)}.`
  };
}
