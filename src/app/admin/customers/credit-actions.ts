"use server";

import { revalidatePath } from "next/cache";

import { getCustomerCreditSummaries } from "@/lib/customer-credit-data";
import { sendManualCustomerCreditReminder } from "@/lib/customer-credit-reminders";
import { requireRestaurantRole } from "@/lib/super-admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isValidCustomerPhone } from "@/lib/security";
import { normalizeCustomerPhone } from "@/lib/whatsapp";
import type { Customer, CustomerCreditPaymentMethod } from "@/lib/types";

export type CustomerCreditActionState = {
  error?: string;
  success?: string;
  warning?: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function field(formData: FormData, key: string, maxLength: number) {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

function amount(formData: FormData, key: string) {
  const value = Number(field(formData, key, 30));
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : NaN;
}

async function managementSession() {
  return requireRestaurantRole(["restaurant_admin", "owner", "manager"]);
}

function refreshCreditViews() {
  revalidatePath("/admin/customers");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/shifts");
  revalidatePath("/admin");
}

export async function createCreditCustomerAction(
  _previousState: CustomerCreditActionState,
  formData: FormData
): Promise<CustomerCreditActionState> {
  const session = await managementSession();
  const admin = getSupabaseAdmin();
  const name = field(formData, "name", 120);
  const phone = normalizeCustomerPhone(
    field(formData, "phone", 24),
    session.restaurant.phone_country_code
  );
  const creditLimit = amount(formData, "credit_limit");
  const openingBalance = amount(formData, "opening_balance");
  const termsDays = Number(field(formData, "terms_days", 4));
  const remindersEnabled = field(formData, "reminders_enabled", 10) === "true";
  const customerAgreed = field(formData, "customer_agreed", 10) === "yes";
  if (!admin) return { error: "Customer credit is unavailable." };
  if (
    !name ||
    !customerAgreed ||
    !isValidCustomerPhone(phone) ||
    !Number.isFinite(creditLimit) ||
    creditLimit <= 0 ||
    creditLimit > 1_000_000 ||
    !Number.isFinite(openingBalance) ||
    openingBalance < 0 ||
    openingBalance > creditLimit ||
    !Number.isInteger(termsDays) ||
    termsDays < 0 ||
    termsDays > 365
  ) {
    return {
      error:
        "Enter valid customer details and confirm permission to keep the credit account."
    };
  }

  const { error } = await admin.rpc("create_credit_customer_account", {
    target_restaurant_id: session.restaurantId,
    requested_name: name,
    requested_phone: phone,
    requested_credit_limit: creditLimit,
    requested_terms_days: termsDays,
    requested_reminders_enabled: remindersEnabled,
    requested_opening_balance: openingBalance,
    event_actor_user_id: session.userId
  });
  if (error) {
    const known = [
      "Opening balance can only be recorded on a new empty account",
      "A valid customer name and phone are required"
    ].find((message) => error.message.includes(message));
    return { error: known ?? "The credit customer could not be added." };
  }
  refreshCreditViews();
  return { success: `${name} is ready for customer-credit orders.` };
}

export async function configureCustomerCreditAction(
  _previousState: CustomerCreditActionState,
  formData: FormData
): Promise<CustomerCreditActionState> {
  const session = await managementSession();
  const admin = getSupabaseAdmin();
  const customerId = field(formData, "customer_id", 80);
  const creditLimit = amount(formData, "credit_limit");
  const openingBalanceField = field(formData, "opening_balance", 30);
  const openingBalance = openingBalanceField ? amount(formData, "opening_balance") : 0;
  const termsDays = Number(field(formData, "terms_days", 4));
  const enabled = field(formData, "is_enabled", 10) === "true";
  const remindersEnabled = field(formData, "reminders_enabled", 10) === "true";
  if (!admin) return { error: "Customer credit is unavailable." };
  if (
    !UUID_PATTERN.test(customerId) ||
    !Number.isFinite(creditLimit) ||
    creditLimit < 0 ||
    creditLimit > 1_000_000 ||
    !Number.isInteger(termsDays) ||
    termsDays < 0 ||
    termsDays > 365 ||
    !Number.isFinite(openingBalance) ||
    openingBalance < 0 ||
    openingBalance > creditLimit
  ) {
    return { error: "Enter a valid limit, repayment period and opening balance." };
  }

  const { error } = await admin.rpc("configure_customer_credit_account", {
    target_restaurant_id: session.restaurantId,
    target_customer_id: customerId,
    requested_enabled: enabled,
    requested_credit_limit: creditLimit,
    requested_terms_days: termsDays,
    requested_reminders_enabled: remindersEnabled,
    requested_opening_balance: openingBalance,
    event_actor_user_id: session.userId
  });
  if (error) {
    const known = [
      "Customer not found",
      "Opening balance can only be recorded on a new empty account"
    ].find((message) => error.message.includes(message));
    return { error: known ?? "Credit settings could not be saved." };
  }
  refreshCreditViews();
  return { success: enabled ? "Customer credit enabled and saved." : "Customer credit paused." };
}

export async function recordCustomerCreditPaymentAction(
  _previousState: CustomerCreditActionState,
  formData: FormData
): Promise<CustomerCreditActionState> {
  const session = await managementSession();
  const admin = getSupabaseAdmin();
  const customerId = field(formData, "customer_id", 80);
  const paymentAmount = amount(formData, "amount");
  const paymentMethod = field(formData, "payment_method", 30) as CustomerCreditPaymentMethod;
  const note = field(formData, "note", 300);
  if (!admin) return { error: "Customer credit is unavailable." };
  if (!UUID_PATTERN.test(customerId) || !Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    return { error: "Enter a valid payment amount." };
  }
  const allowed: CustomerCreditPaymentMethod[] = [
    "cash",
    "card",
    "bank_transfer",
    "other",
    ...(session.restaurant.country_code === "IN" ? (["upi"] as const) : [])
  ];
  if (!allowed.includes(paymentMethod)) {
    return { error: "Choose a valid payment method." };
  }

  const { error } = await admin.rpc("record_customer_credit_payment", {
    target_restaurant_id: session.restaurantId,
    target_customer_id: customerId,
    requested_amount: paymentAmount,
    requested_payment_method: paymentMethod,
    requested_note: note || null,
    event_actor_user_id: session.userId
  });
  if (error) {
    const known = [
      "Payment exceeds the outstanding balance",
      "Open a shift before recording a customer credit payment",
      "Customer credit account not found"
    ].find((message) => error.message.includes(message));
    return { error: known ?? "The credit payment could not be recorded." };
  }
  refreshCreditViews();
  return { success: "Credit payment recorded in the customer ledger and open shift." };
}

export async function writeOffCustomerCreditAction(
  _previousState: CustomerCreditActionState,
  formData: FormData
): Promise<CustomerCreditActionState> {
  const session = await requireRestaurantRole(["restaurant_admin", "owner"]);
  const admin = getSupabaseAdmin();
  const customerId = field(formData, "customer_id", 80);
  const writeOffAmount = amount(formData, "amount");
  const note = field(formData, "note", 300);
  if (!admin) return { error: "Customer credit is unavailable." };
  if (
    !UUID_PATTERN.test(customerId) ||
    !Number.isFinite(writeOffAmount) ||
    writeOffAmount <= 0 ||
    !note
  ) {
    return { error: "Enter a valid amount and write-off reason." };
  }
  const { error } = await admin.rpc("write_off_customer_credit", {
    target_restaurant_id: session.restaurantId,
    target_customer_id: customerId,
    requested_amount: writeOffAmount,
    requested_note: note,
    event_actor_user_id: session.userId
  });
  if (error) {
    const known = ["Write-off exceeds the outstanding balance"].find((message) =>
      error.message.includes(message)
    );
    return { error: known ?? "The write-off could not be recorded." };
  }
  refreshCreditViews();
  return { success: "Credit write-off recorded. The original ledger remains unchanged." };
}

export async function sendCustomerCreditReminderAction(
  _previousState: CustomerCreditActionState,
  formData: FormData
): Promise<CustomerCreditActionState> {
  const session = await managementSession();
  const admin = getSupabaseAdmin();
  const customerId = field(formData, "customer_id", 80);
  if (!admin || !UUID_PATTERN.test(customerId)) {
    return { error: "Credit reminder is unavailable." };
  }
  const { data, error } = await admin
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("restaurant_id", session.restaurantId)
    .maybeSingle();
  if (error || !data) return { error: "Customer not found." };
  const customer = data as Customer;
  const summaries = await getCustomerCreditSummaries(session.restaurant, [customer]);
  const summary = summaries.byCustomerId[customer.id];
  if (!summary || summary.balance <= 0) {
    return { error: "This customer has no outstanding credit balance." };
  }

  try {
    const result = await sendManualCustomerCreditReminder({
      restaurant: session.restaurant,
      customer,
      summary,
      actorUserId: session.userId
    });
    revalidatePath("/admin/customers");
    if (result.delivered) return { success: "WhatsApp accepted the credit reminder." };
    if (result.reason === "no_open_service_window") {
      return {
        warning:
          "Reminder recorded but not sent. Cloud API needs an open 24-hour customer window; use WhatsApp Web or ask the customer to message the restaurant."
      };
    }
    return { warning: "Reminder recorded, but WhatsApp did not accept the message." };
  } catch {
    return { error: "The credit reminder could not be sent." };
  }
}
