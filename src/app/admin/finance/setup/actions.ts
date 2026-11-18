"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseAedToFils } from "@/lib/finance";
import { requireFinancePermission } from "@/lib/finance-data";
import { firstDayOfPreviousMonth, monthlyBillSchedule, SETUP_MONTHLY_BILLS } from "@/lib/finance-simple";
import { getSupabaseAdmin } from "@/lib/supabase";

function restaurantToday(timeZone: string | null | undefined) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone ?? "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}

// "What does one of these cost you to make?" for many menu items at once.
export async function saveQuickItemCostsAction(formData: FormData) {
  const { session } = await requireFinancePermission("manage_costing");
  const admin = getSupabaseAdmin();
  const path = "/admin/finance/menu-costs";
  if (!admin) redirect(`${path}?error=${encodeURIComponent("Finance is unavailable. Try again later.")}`);

  const today = restaurantToday(session.restaurant.time_zone);
  const startFrom = firstDayOfPreviousMonth(today);
  let saved = 0;
  const problems: string[] = [];
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("cost_")) continue;
    const itemId = key.slice(5);
    const text = String(raw).trim();
    const previous = String(formData.get(`previous_${itemId}`) ?? "").trim();
    if (!text || text === previous || !/^[0-9a-f-]{36}$/i.test(itemId)) continue;
    const costFils = parseAedToFils(text);
    if (costFils === null) {
      problems.push(String(formData.get(`name_${itemId}`) ?? "an item"));
      continue;
    }
    const { error } = await admin.rpc("set_finance_quick_item_cost", {
      target_restaurant_id: session.restaurantId,
      target_menu_item_id: itemId,
      requested_cost_fils: costFils,
      requested_first_effective_on: startFrom,
      event_actor_user_id: session.userId
    });
    if (error) problems.push(String(formData.get(`name_${itemId}`) ?? "an item"));
    else saved += 1;
  }

  // Re-cost orders from the start of last month that had no food cost yet.
  if (saved > 0) {
    for (let round = 0; round < 3; round += 1) {
      const { data, error } = await admin.rpc("recost_finance_incomplete_orders", {
        target_restaurant_id: session.restaurantId, requested_start: startFrom,
        requested_end: today, requested_limit: 2000
      });
      if (error || Number((data as { orders_processed?: number } | null)?.orders_processed ?? 0) < 2000) break;
    }
  }

  revalidatePath(path);
  revalidatePath("/admin/finance");
  revalidatePath("/admin/finance/summary");
  const message = saved > 0
    ? `Saved costs for ${saved} item${saved === 1 ? "" : "s"}. “How am I doing?” now includes them.`
    : "Nothing changed.";
  const query = problems.length > 0
    ? `error=${encodeURIComponent(`Couldn’t save: ${problems.slice(0, 5).join(", ")}. Enter a number like 1.25.`)}&success=${encodeURIComponent(message)}`
    : `success=${encodeURIComponent(message)}`;
  redirect(`${path}?${query}`);
}

// Two-minute setup: monthly bills and who can use Finance.
export async function saveFinanceSetupAction(formData: FormData) {
  const { session, access } = await requireFinancePermission("manage_recurring");
  const admin = getSupabaseAdmin();
  const path = "/admin/finance/setup";
  if (!admin) redirect(`${path}?error=${encodeURIComponent("Finance is unavailable. Try again later.")}`);

  const today = restaurantToday(session.restaurant.time_zone);
  const { data: categories } = await admin.from("finance_categories")
    .select("id,name").eq("restaurant_id", session.restaurantId).eq("is_active", true);
  const categoryByName = new Map((categories ?? []).map((row) => [String(row.name).toLowerCase(), String(row.id)]));

  let added = 0;
  for (const bill of SETUP_MONTHLY_BILLS) {
    const amountText = String(formData.get(`amount_${bill.key}`) ?? "").trim();
    if (!amountText) continue;
    const amountFils = parseAedToFils(amountText);
    const day = Number(formData.get(`day_${bill.key}`) ?? 1);
    const categoryId = categoryByName.get(bill.category.toLowerCase()) ?? categoryByName.get("other");
    if (amountFils === null || !categoryId || !Number.isInteger(day) || day < 1 || day > 28) {
      redirect(`${path}?error=${encodeURIComponent(`Check the amount and day for ${bill.label}.`)}`);
    }
    const schedule = monthlyBillSchedule(today, day);
    const { error } = await admin.from("finance_recurring_costs").insert({
      restaurant_id: session.restaurantId, category_id: categoryId,
      description: bill.label, amount_fils: amountFils, frequency: "monthly", allocation_months: 1,
      start_on: schedule.startOn, next_due_on: schedule.nextDueOn,
      created_by: session.userId, updated_by: session.userId
    });
    if (error) redirect(`${path}?error=${encodeURIComponent(`${bill.label} could not be saved.`)}`);
    added += 1;
  }

  if (access.manage_permissions && formData.get("access_submitted") === "yes") {
    const managersSeeMoney = formData.get("manager_view") === "on";
    // Only the switches shown in setup; other permissions set in the advanced
    // view are left as they are.
    const rows: Array<Record<string, string | boolean>> = [
      {
        restaurant_id: session.restaurantId, role: "manager",
        can_view: managersSeeMoney, can_create: formData.get("manager_create") === "on",
        can_approve: managersSeeMoney, can_view_reports: managersSeeMoney,
        updated_by: session.userId
      },
      {
        restaurant_id: session.restaurantId, role: "staff",
        can_create: formData.get("staff_create") === "on",
        updated_by: session.userId
      }
    ];
    let error = null;
    for (const row of rows) {
      ({ error } = await admin.from("finance_role_permissions").upsert(row, { onConflict: "restaurant_id,role" }));
      if (error) break;
    }
    if (error) redirect(`${path}?error=${encodeURIComponent("Who-can-use settings could not be saved.")}`);
  }

  revalidatePath("/admin/finance");
  revalidatePath(path);
  redirect(`/admin/finance?success=${encodeURIComponent(added > 0
    ? `Setup saved. ${added} monthly bill${added === 1 ? "" : "s"} added.`
    : "Setup saved.")}`);
}
