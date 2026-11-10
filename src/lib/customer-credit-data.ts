import "server-only";

import { calculateCustomerCreditSummary } from "@/lib/customer-credit";
import { getSupabaseAdmin } from "@/lib/supabase";
import type {
  Customer,
  CustomerCreditAccount,
  CustomerCreditEntry,
  CustomerCreditPortfolio,
  CustomerCreditReminder,
  CustomerCreditSummary,
  Order,
  Restaurant,
  StaffCreditCustomerOption
} from "@/lib/types";

function localDateString(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export type CustomerCreditMaps = {
  byCustomerId: Record<string, CustomerCreditSummary>;
  byPhone: Record<string, CustomerCreditSummary>;
};

export async function getCustomerCreditSummaries(
  restaurant: Restaurant,
  customers: Pick<Customer, "id" | "phone">[]
): Promise<CustomerCreditMaps> {
  if (customers.length === 0) {
    return { byCustomerId: {}, byPhone: {} };
  }
  const admin = getSupabaseAdmin();
  if (!admin) return { byCustomerId: {}, byPhone: {} };

  const customerIds = customers.map((customer) => customer.id);
  const accountsResult = await admin
    .from("customer_credit_accounts")
    .select(
      "id, restaurant_id, customer_id, is_enabled, credit_limit, terms_days, reminders_enabled, created_at, updated_at"
    )
    .eq("restaurant_id", restaurant.id)
    .in("customer_id", customerIds);
  if (accountsResult.error) {
    throw new Error("Customer credit accounts could not be loaded.");
  }

  const accounts = (accountsResult.data ?? []) as CustomerCreditAccount[];
  if (accounts.length === 0) {
    return { byCustomerId: {}, byPhone: {} };
  }
  const accountIds = accounts.map((account) => account.id);
  const [entriesResult, remindersResult] = await Promise.all([
    admin
      .from("customer_credit_entries")
      .select(
        "id, restaurant_id, account_id, order_id, entry_type, amount, due_date, payment_method, note, actor_user_id, created_at"
      )
      .eq("restaurant_id", restaurant.id)
      .in("account_id", accountIds)
      .order("created_at", { ascending: false }),
    admin
      .from("customer_credit_reminders")
      .select(
        "id, restaurant_id, account_id, reminder_on, reminder_kind, is_manual, balance_snapshot, overdue_snapshot, delivery_status, delivery_reason, transport_message_id, sent_by_user_id, created_at"
      )
      .eq("restaurant_id", restaurant.id)
      .in("account_id", accountIds)
      .order("created_at", { ascending: false })
  ]);
  if (entriesResult.error || remindersResult.error) {
    throw new Error("Customer credit history could not be loaded.");
  }

  const entries = (entriesResult.data ?? []) as CustomerCreditEntry[];
  const reminders = (remindersResult.data ?? []) as CustomerCreditReminder[];
  const firstReminderByAccount = new Map<string, CustomerCreditReminder>();
  for (const reminder of reminders) {
    if (!firstReminderByAccount.has(reminder.account_id)) {
      firstReminderByAccount.set(reminder.account_id, reminder);
    }
  }

  const today = localDateString(restaurant.time_zone ?? "Asia/Dubai");
  const byCustomerId: Record<string, CustomerCreditSummary> = {};
  for (const account of accounts) {
    byCustomerId[account.customer_id] = calculateCustomerCreditSummary(
      account,
      entries.filter((entry) => entry.account_id === account.id),
      today,
      firstReminderByAccount.get(account.id) ?? null
    );
  }

  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const byPhone: Record<string, CustomerCreditSummary> = {};
  for (const [customerId, summary] of Object.entries(byCustomerId)) {
    const customer = customerById.get(customerId);
    if (customer) byPhone[customer.phone] = summary;
  }
  return { byCustomerId, byPhone };
}

export async function getCustomerCreditSummariesByPhones(
  restaurant: Restaurant,
  phones: string[]
) {
  const uniquePhones = [...new Set(phones.filter(Boolean))];
  if (uniquePhones.length === 0) return {};
  const admin = getSupabaseAdmin();
  if (!admin) return {};
  const { data, error } = await admin
    .from("customers")
    .select("id, phone")
    .eq("restaurant_id", restaurant.id)
    .in("phone", uniquePhones);
  if (error) throw new Error("Credit customers could not be loaded.");
  return (await getCustomerCreditSummaries(
    restaurant,
    (data ?? []) as Pick<Customer, "id" | "phone">[]
  )).byPhone;
}

export async function getCustomerCreditSummariesForOrders(
  restaurant: Restaurant,
  orders: Pick<Order, "customer_id" | "customer_phone">[]
): Promise<CustomerCreditMaps> {
  const customerIds = [
    ...new Set(orders.map((order) => order.customer_id).filter(Boolean) as string[])
  ];
  const fallbackPhones = [
    ...new Set(
      orders
        .filter((order) => !order.customer_id)
        .map((order) => order.customer_phone)
        .filter(Boolean)
    )
  ];
  if (customerIds.length === 0 && fallbackPhones.length === 0) {
    return { byCustomerId: {}, byPhone: {} };
  }
  const admin = getSupabaseAdmin();
  if (!admin) return { byCustomerId: {}, byPhone: {} };

  const [byIdResult, byPhoneResult] = await Promise.all([
    customerIds.length > 0
      ? admin
          .from("customers")
          .select("id, phone")
          .eq("restaurant_id", restaurant.id)
          .in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    fallbackPhones.length > 0
      ? admin
          .from("customers")
          .select("id, phone")
          .eq("restaurant_id", restaurant.id)
          .in("phone", fallbackPhones)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (byIdResult.error || byPhoneResult.error) {
    throw new Error("Credit customers could not be loaded.");
  }
  const customers = [...(byIdResult.data ?? []), ...(byPhoneResult.data ?? [])]
    .filter(
      (customer, index, rows) =>
        rows.findIndex((candidate) => candidate.id === customer.id) === index
    ) as Pick<Customer, "id" | "phone">[];
  return getCustomerCreditSummaries(restaurant, customers);
}

export async function getSelectableCreditCustomers(
  restaurant: Restaurant
): Promise<StaffCreditCustomerOption[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const accountsResult = await admin
    .from("customer_credit_accounts")
    .select("customer_id")
    .eq("restaurant_id", restaurant.id)
    .eq("is_enabled", true)
    .order("updated_at", { ascending: false })
    .limit(250);
  if (accountsResult.error) {
    throw new Error("Credit accounts could not be loaded.");
  }
  if (!accountsResult.data?.length) return [];

  const customerIds = accountsResult.data.map((account) => account.customer_id);
  const customersResult = await admin
    .from("customers")
    .select("id, name, phone")
    .eq("restaurant_id", restaurant.id)
    .in("id", customerIds)
    .order("name");
  if (customersResult.error) {
    throw new Error("Credit customers could not be loaded.");
  }
  const customers = (customersResult.data ?? []) as Pick<
    Customer,
    "id" | "name" | "phone"
  >[];
  const summaries = await getCustomerCreditSummaries(restaurant, customers);

  return customers.flatMap((customer) => {
    const summary = summaries.byCustomerId[customer.id];
    if (!summary?.account.is_enabled) return [];
    return [{
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      balance: summary.balance,
      overdue: summary.overdue,
      available: summary.available,
      credit_limit: Number(summary.account.credit_limit),
      terms_days: summary.account.terms_days
    }];
  });
}

export async function getCustomerCreditPortfolio(restaurantId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { enabled_customers: 0, outstanding: 0, overdue: 0 };
  }
  const { data, error } = await admin.rpc("customer_credit_portfolio", {
    target_restaurant_id: restaurantId
  });
  if (error) throw new Error("Customer credit portfolio could not be loaded.");
  const value = (data ?? {}) as Partial<CustomerCreditPortfolio>;
  return {
    enabled_customers: Number(value.enabled_customers ?? 0),
    outstanding: Number(value.outstanding ?? 0),
    overdue: Number(value.overdue ?? 0)
  } satisfies CustomerCreditPortfolio;
}

export { localDateString as customerCreditLocalDateString };
