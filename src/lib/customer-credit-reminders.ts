import "server-only";

import {
  automaticCreditReminderKind,
  buildCustomerCreditReminderMessage,
  type CreditReminderKind
} from "@/lib/customer-credit";
import {
  customerCreditLocalDateString,
  getCustomerCreditSummaries
} from "@/lib/customer-credit-data";
import { isServiceWindowOpen } from "@/lib/order-notifications";
import { getSupabaseAdmin } from "@/lib/supabase";
import type {
  Customer,
  CustomerCreditSummary,
  Restaurant
} from "@/lib/types";
import { normalizeCustomerPhone } from "@/lib/whatsapp";
import {
  getWhatsAppIntegration,
  integrationAllowsFreeForm,
  sendRestaurantWhatsAppText
} from "@/lib/whatsapp-integration";

export type CreditReminderDelivery = {
  delivered: boolean;
  reason: "accepted" | "duplicate" | "no_open_service_window" | "transport_failed";
};

async function deliverCustomerCreditReminder(input: {
  restaurant: Restaurant;
  customer: Customer;
  summary: CustomerCreditSummary;
  kind: CreditReminderKind | "manual";
  manual: boolean;
  actorUserId?: string | null;
}): Promise<CreditReminderDelivery> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Credit reminder service is unavailable.");
  const today = customerCreditLocalDateString(
    input.restaurant.time_zone ?? "Asia/Dubai"
  );
  const reminder = await admin
    .from("customer_credit_reminders")
    .insert({
      restaurant_id: input.restaurant.id,
      account_id: input.summary.account.id,
      reminder_on: today,
      reminder_kind: input.kind,
      is_manual: input.manual,
      balance_snapshot: input.summary.balance,
      overdue_snapshot: input.summary.overdue,
      sent_by_user_id: input.actorUserId ?? null,
      delivery_status: "sending"
    })
    .select("id")
    .single();
  if (reminder.error) {
    if (!input.manual && reminder.error.code === "23505") {
      return { delivered: false, reason: "duplicate" };
    }
    throw new Error("Credit reminder could not be queued.");
  }

  const phone = normalizeCustomerPhone(
    input.customer.phone,
    input.restaurant.phone_country_code
  );
  const [integration, windowResult] = await Promise.all([
    getWhatsAppIntegration(input.restaurant.id),
    admin
      .from("whatsapp_service_windows")
      .select("last_inbound_at")
      .eq("restaurant_id", input.restaurant.id)
      .eq("phone", phone)
      .maybeSingle()
  ]);

  let messageId: string | null = null;
  let reason: CreditReminderDelivery["reason"] = "transport_failed";
  if (
    !windowResult.error &&
    integrationAllowsFreeForm(
      integration,
      isServiceWindowOpen(windowResult.data?.last_inbound_at)
    )
  ) {
    messageId = await sendRestaurantWhatsAppText(
      input.restaurant.id,
      phone,
      buildCustomerCreditReminderMessage(input)
    );
    reason = messageId ? "accepted" : "transport_failed";
  } else if (!windowResult.error) {
    reason = "no_open_service_window";
  }

  const { error: saveError } = await admin
    .from("customer_credit_reminders")
    .update({
      delivery_status:
        reason === "accepted"
          ? "accepted"
          : reason === "no_open_service_window"
            ? "skipped"
            : "failed",
      delivery_reason: reason,
      transport_message_id: messageId
    })
    .eq("id", reminder.data.id)
    .eq("restaurant_id", input.restaurant.id);
  if (saveError) {
    console.error("Customer credit reminder outcome could not be recorded", {
      restaurantId: input.restaurant.id,
      reminderId: reminder.data.id
    });
  }
  return { delivered: reason === "accepted", reason };
}

export async function sendManualCustomerCreditReminder(input: {
  restaurant: Restaurant;
  customer: Customer;
  summary: CustomerCreditSummary;
  actorUserId: string;
}) {
  if (input.summary.balance <= 0) {
    throw new Error("This customer has no outstanding credit balance.");
  }
  return deliverCustomerCreditReminder({
    ...input,
    kind: "manual",
    manual: true
  });
}

export async function processCustomerCreditReminders(restaurantId?: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Credit reminder service is unavailable.");
  let restaurantQuery = admin
    .from("restaurants")
    .select(
      "id, name, slug, whatsapp_number, address, delivery_fee, minimum_order_amount, is_active, country_code, currency_code, locale, phone_country_code, time_zone, created_at"
    )
    .eq("is_active", true)
    .limit(100);
  if (restaurantId) restaurantQuery = restaurantQuery.eq("id", restaurantId);
  const restaurantsResult = await restaurantQuery;
  if (restaurantsResult.error) throw new Error("Credit reminder restaurants could not be loaded.");

  const counts = { accepted: 0, skipped: 0, failed: 0 };
  let attempted = 0;
  for (const rawRestaurant of restaurantsResult.data ?? []) {
    if (attempted >= 10) break;
    const restaurant = rawRestaurant as Restaurant;
    const accountsResult = await admin
      .from("customer_credit_accounts")
      .select("customer_id")
      .eq("restaurant_id", restaurant.id)
      .eq("is_enabled", true)
      .eq("reminders_enabled", true)
      .limit(100);
    if (accountsResult.error || !accountsResult.data?.length) continue;
    const customerIds = accountsResult.data.map((account) => account.customer_id);
    const customersResult = await admin
      .from("customers")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .in("id", customerIds);
    if (customersResult.error) continue;
    const customers = (customersResult.data ?? []) as Customer[];
    const summaries = await getCustomerCreditSummaries(restaurant, customers);
    const today = customerCreditLocalDateString(
      restaurant.time_zone ?? "Asia/Dubai"
    );

    for (const customer of customers) {
      if (attempted >= 10) break;
      const summary = summaries.byCustomerId[customer.id];
      if (!summary) continue;
      const kind = automaticCreditReminderKind(summary, today);
      if (!kind) continue;
      attempted++;
      try {
        const result = await deliverCustomerCreditReminder({
          restaurant,
          customer,
          summary,
          kind,
          manual: false
        });
        if (result.delivered) counts.accepted++;
        else if (result.reason === "transport_failed") counts.failed++;
        else counts.skipped++;
      } catch (error) {
        counts.failed++;
        console.error("Customer credit reminder failed", {
          restaurantId: restaurant.id,
          customerId: customer.id,
          message: error instanceof Error ? error.message : "unknown"
        });
      }
    }
  }
  return { ...counts, attempted };
}
