import "server-only";

import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  DEFAULT_CURRENCY,
  DEFAULT_VAT_RATE,
  GRACE_DAYS,
  NET_TERMS_DAYS,
  NO_SUBSCRIPTION_ACCESS,
  TRIAL_DAYS,
  addDays,
  billingCycleFor,
  billingDateString,
  buildContractChangePatch,
  computeInvoiceTotals,
  computeLineTotal,
  deriveAccessLevel,
  invoiceIdempotencyKey,
  priceForBillingInterval,
  priceForSubscription,
  resolvePlanFeatures,
  toDateString
} from "@/lib/billing";
import type {
  Invoice,
  InvoiceLineItem,
  Payment,
  Plan,
  Subscription,
  SubscriptionStatus,
  BillingInterval,
  TenantAccess
} from "@/lib/billing";

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export type BillingActor = { userId: string | null; role: string | null };

export type BillingResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function getAdmin(): Admin {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error("Supabase service-role client is not configured.");
  }
  return admin;
}

function today(reference: Date = new Date()): string {
  return billingDateString(reference);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
async function fetchSubscription(
  admin: Admin,
  restaurantId: string
): Promise<Subscription | null> {
  const { data, error } = await admin
    .from("subscriptions")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error) {
    throw new Error(`Subscription could not be loaded: ${error.message}`);
  }
  return (data as Subscription | null) ?? null;
}

async function fetchPlan(admin: Admin, planId: string): Promise<Plan | null> {
  const { data, error } = await admin.from("plans").select("*").eq("id", planId).maybeSingle();
  if (error) {
    throw new Error(`Plan could not be loaded: ${error.message}`);
  }
  return (data as Plan | null) ?? null;
}

export async function listActivePlans(): Promise<Plan[]> {
  const admin = getAdmin();
  const { data, error } = await admin
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("monthly_price", { ascending: true });
  if (error) {
    throw new Error(`Billing plans could not be loaded: ${error.message}`);
  }
  return (data as Plan[] | null) ?? [];
}

// The one helper the app reads to gate features (Feature Brief §7). Pure read —
// healing/aging happen on payment events and in the cron, never here, so this
// is safe to call during render.
export const getTenantAccess = cache(async function getTenantAccess(
  restaurantId: string
): Promise<TenantAccess> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NO_SUBSCRIPTION_ACCESS;
  }

  const { data, error } = await admin.rpc("get_tenant_access_snapshot", {
    target_restaurant_id: restaurantId
  });
  if (error) {
    throw new Error(`Tenant billing access could not be loaded: ${error.message}`);
  }
  if (!data) {
    return NO_SUBSCRIPTION_ACCESS;
  }
  const snapshot = data as {
    subscription?: Subscription | null;
    plan?: Plan | null;
  };
  const subscription = snapshot.subscription ?? null;
  if (!subscription) {
    return NO_SUBSCRIPTION_ACCESS;
  }
  const plan = snapshot.plan ?? null;

  return {
    access: deriveAccessLevel(subscription.status),
    status: subscription.status,
    plan_code: plan?.code ?? null,
    plan_name: plan?.name ?? null,
    plan_features: resolvePlanFeatures(plan?.features ?? null),
    limits: {
      max_branches: plan?.max_branches ?? null,
      max_staff: plan?.max_staff ?? null
    }
  };
});

export type SubscriptionSummary = {
  subscription: Subscription;
  plan: Plan | null;
  restaurant: { id: string; name: string; slug: string };
  outstanding: number;
};

export async function listSubscriptionsForBilling(): Promise<SubscriptionSummary[]> {
  const admin = getAdmin();
  const { data: subscriptions, error: subscriptionsError } = await admin
    .from("subscriptions")
    .select("*")
    .order("updated_at", { ascending: false });
  if (subscriptionsError) {
    throw new Error(`Subscriptions could not be loaded: ${subscriptionsError.message}`);
  }

  const subs = (subscriptions as Subscription[] | null) ?? [];
  if (subs.length === 0) {
    return [];
  }

  const restaurantIds = subs.map((sub) => sub.restaurant_id);
  const planIds = Array.from(new Set(subs.map((sub) => sub.plan_id)));

  const [restaurantResult, planResult, invoiceResult] = await Promise.all([
    admin.from("restaurants").select("id,name,slug").in("id", restaurantIds),
    admin.from("plans").select("*").in("id", planIds),
    admin
      .from("invoices")
      .select("id,restaurant_id,total")
      .in("restaurant_id", restaurantIds)
      .in("status", ["issued"])
  ]);
  if (restaurantResult.error || planResult.error || invoiceResult.error) {
    throw new Error(
      `Billing overview could not be loaded: ${restaurantResult.error?.message ?? planResult.error?.message ?? invoiceResult.error?.message}`
    );
  }
  const restaurants = restaurantResult.data;
  const plans = planResult.data;
  const openInvoices = invoiceResult.data;

  const restaurantsById = new Map(
    ((restaurants as Array<{ id: string; name: string; slug: string }> | null) ?? []).map((r) => [
      r.id,
      r
    ])
  );
  const plansById = new Map(((plans as Plan[] | null) ?? []).map((p) => [p.id, p]));
  const outstandingByRestaurant = new Map<string, number>();
  const openInvoiceRows = (openInvoices as Array<{ id: string; restaurant_id: string; total: number }> | null) ?? [];
  const paidByInvoice = new Map<string, number>();
  if (openInvoiceRows.length > 0) {
    const { data: paymentRows, error: paymentsError } = await admin
      .from("payments")
      .select("invoice_id,amount")
      .in("invoice_id", openInvoiceRows.map((invoice) => invoice.id));
    if (paymentsError) {
      throw new Error(`Billing payments could not be loaded: ${paymentsError.message}`);
    }
    for (const payment of (paymentRows as Array<{ invoice_id: string; amount: number }> | null) ?? []) {
      paidByInvoice.set(
        payment.invoice_id,
        (paidByInvoice.get(payment.invoice_id) ?? 0) + Number(payment.amount)
      );
    }
  }
  for (const invoice of openInvoiceRows) {
    outstandingByRestaurant.set(
      invoice.restaurant_id,
      (outstandingByRestaurant.get(invoice.restaurant_id) ?? 0) +
        Math.max(0, Number(invoice.total) - (paidByInvoice.get(invoice.id) ?? 0))
    );
  }

  return subs.map((subscription) => ({
    subscription,
    plan: plansById.get(subscription.plan_id) ?? null,
    restaurant: restaurantsById.get(subscription.restaurant_id) ?? {
      id: subscription.restaurant_id,
      name: "Unknown restaurant",
      slug: ""
    },
    outstanding: outstandingByRestaurant.get(subscription.restaurant_id) ?? 0
  }));
}

export type StatusEvent = {
  id: string;
  from_status: SubscriptionStatus | null;
  to_status: SubscriptionStatus;
  reason: string | null;
  actor_role: string | null;
  created_at: string;
};

export type BillingDetail = {
  restaurant: { id: string; name: string; slug: string };
  subscription: Subscription | null;
  plan: Plan | null;
  invoices: Array<Invoice & { line_items: InvoiceLineItem[]; paid_to_date: number }>;
  payments: Payment[];
  statusEvents: StatusEvent[];
  priceEvents: PriceEvent[];
};

export type PriceEvent = {
  id: string;
  previous_price: number | null;
  new_price: number | null;
  reason: string;
  ends_at: string | null;
  actor_role: string | null;
  created_at: string;
};

export async function getBillingDetail(restaurantId: string): Promise<BillingDetail | null> {
  const admin = getAdmin();
  const { data: restaurant, error: restaurantError } = await admin
    .from("restaurants")
    .select("id,name,slug")
    .eq("id", restaurantId)
    .maybeSingle();
  if (restaurantError) {
    throw new Error(`Restaurant billing profile could not be loaded: ${restaurantError.message}`);
  }

  if (!restaurant) {
    return null;
  }

  const subscription = await fetchSubscription(admin, restaurantId);
  const plan = subscription ? await fetchPlan(admin, subscription.plan_id) : null;

  const [invoiceResult, lineItemResult, paymentResult, statusEventResult, priceEventResult] = await Promise.all([
      admin
        .from("invoices")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false }),
      admin.from("invoice_line_items").select("*").eq("restaurant_id", restaurantId),
      admin
        .from("payments")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("received_at", { ascending: false }),
      admin
        .from("subscription_status_events")
        .select("id,from_status,to_status,reason,actor_role,created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false }),
      admin
        .from("subscription_price_events")
        .select("id,previous_price,new_price,reason,ends_at,actor_role,created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
    ]);
  const detailError =
    invoiceResult.error ??
    lineItemResult.error ??
    paymentResult.error ??
    statusEventResult.error ??
    priceEventResult.error;
  if (detailError) {
    throw new Error(`Billing history could not be loaded: ${detailError.message}`);
  }
  const invoices = invoiceResult.data;
  const lineItems = lineItemResult.data;
  const payments = paymentResult.data;
  const statusEvents = statusEventResult.data;
  const priceEvents = priceEventResult.data;

  const lineItemsByInvoice = new Map<string, InvoiceLineItem[]>();
  for (const item of (lineItems as InvoiceLineItem[] | null) ?? []) {
    const list = lineItemsByInvoice.get(item.invoice_id) ?? [];
    list.push(item);
    lineItemsByInvoice.set(item.invoice_id, list);
  }

  const paidByInvoice = new Map<string, number>();
  const paymentRows = (payments as Payment[] | null) ?? [];
  for (const payment of paymentRows) {
    paidByInvoice.set(
      payment.invoice_id,
      (paidByInvoice.get(payment.invoice_id) ?? 0) + Number(payment.amount)
    );
  }

  return {
    restaurant: restaurant as { id: string; name: string; slug: string },
    subscription,
    plan,
    invoices: ((invoices as Invoice[] | null) ?? []).map((invoice) => ({
      ...invoice,
      line_items: lineItemsByInvoice.get(invoice.id) ?? [],
      paid_to_date: paidByInvoice.get(invoice.id) ?? 0
    })),
    payments: paymentRows,
    statusEvents: (statusEvents as StatusEvent[] | null) ?? [],
    priceEvents: (priceEvents as PriceEvent[] | null) ?? []
  };
}

// ---------------------------------------------------------------------------
// Status transitions (audited)
// ---------------------------------------------------------------------------
async function logStatusEvent(
  admin: Admin,
  subscription: Subscription,
  toStatus: SubscriptionStatus,
  reason: string,
  actor: BillingActor
): Promise<void> {
  const { error } = await admin.from("subscription_status_events").insert({
    restaurant_id: subscription.restaurant_id,
    subscription_id: subscription.id,
    from_status: subscription.status,
    to_status: toStatus,
    reason,
    actor_user_id: actor.userId,
    actor_role: actor.role
  });
  if (error) {
    throw new Error(`Subscription status audit could not be recorded: ${error.message}`);
  }
}

// Update a subscription's status (+ any side fields) and record the audit
// event. No-op event when the status is unchanged but side fields still apply.
async function transitionStatus(
  admin: Admin,
  subscription: Subscription,
  toStatus: SubscriptionStatus,
  reason: string,
  actor: BillingActor,
  patch: Partial<Subscription> = {}
): Promise<Subscription> {
  const { data, error } = await admin
    .from("subscriptions")
    .update({ status: toStatus, ...patch })
    .eq("id", subscription.id)
    .eq("restaurant_id", subscription.restaurant_id)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (subscription.status !== toStatus) {
    await logStatusEvent(admin, subscription, toStatus, reason, actor);
  }

  return data as Subscription;
}

// ---------------------------------------------------------------------------
// Invoice issuance — idempotent on {subscription_id}:{period_start} (§5/§9).
// ---------------------------------------------------------------------------
type IssueInvoiceArgs = {
  subscription: Subscription;
  plan: Plan;
  periodStart: string;
  periodEnd: string;
  issuedDate: string;
  description: string;
  descriptionAr?: string | null;
  unitAmount?: number; // defaults to the plan price for the subscription interval
  quantity?: number;
};

export async function issueInvoiceForPeriod(
  admin: Admin,
  args: IssueInvoiceArgs
): Promise<Invoice> {
  const idempotencyKey = invoiceIdempotencyKey(args.subscription.id, args.periodStart);

  // Idempotency guard: a prior run (or the manual path) already issued it.
  const { data: existing, error: existingError } = await admin
    .from("invoices")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existingError) {
    throw new Error(`Existing invoice could not be checked: ${existingError.message}`);
  }
  if (existing) {
    return existing as Invoice;
  }

  const unitAmount =
    args.unitAmount ??
    priceForSubscription(args.plan, args.subscription, args.issuedDate);
  const quantity = args.quantity ?? 1;
  const lineTotal = computeLineTotal(quantity, unitAmount);
  const totals = computeInvoiceTotals([{ line_total: lineTotal }], DEFAULT_VAT_RATE);

  const dueAtIso = new Date(
    `${addDays(args.issuedDate, NET_TERMS_DAYS)}T00:00:00.000Z`
  ).toISOString();

  const { data: invoice, error } = await admin.rpc("issue_billing_invoice", {
    p_restaurant_id: args.subscription.restaurant_id,
    p_subscription_id: args.subscription.id,
    p_period_start: args.periodStart,
    p_period_end: args.periodEnd,
    p_issued_date: args.issuedDate,
    p_due_at: dueAtIso,
    p_subtotal: totals.subtotal,
    p_vat_rate: DEFAULT_VAT_RATE,
    p_vat_amount: totals.vat_amount,
    p_total: totals.total,
    p_currency: args.plan.currency ?? DEFAULT_CURRENCY,
    p_idempotency_key: idempotencyKey,
    p_description: args.description,
    p_description_ar: args.descriptionAr ?? null,
    p_quantity: quantity,
    p_unit_amount: unitAmount,
    p_line_total: lineTotal
  });
  if (error) {
    throw new Error(error.message);
  }
  return invoice as Invoice;
}

function periodLabel(periodStart: string): string {
  return new Date(`${periodStart}T00:00:00.000Z`).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

// ---------------------------------------------------------------------------
// Super-admin operations
// ---------------------------------------------------------------------------

// Put a new tenant on a plan, or update the commercial terms of an existing
// contract. Existing contracts keep their status, cycle, and current invoice.
export async function assignPlan(
  restaurantId: string,
  planId: string,
  options: {
    startTrial?: boolean;
    billingInterval?: BillingInterval;
    priceOverride?: number | null;
    priceOverrideReason?: string | null;
    priceOverrideEndsAt?: string | null;
    actor: BillingActor;
  }
): Promise<BillingResult<{ subscriptionId: string }>> {
  const admin = getAdmin();
  const plan = await fetchPlan(admin, planId);
  if (!plan) {
    return { ok: false, error: "Plan not found." };
  }

  const todayStr = today();
  const billingInterval = options.billingInterval ?? "monthly";
  const cycle = billingCycleFor(billingInterval, todayStr);
  const cycleStart = cycle.start;
  const cycleEnd = cycle.end;
  const startTrial = options.startTrial ?? false;
  const status: SubscriptionStatus = startTrial ? "trialing" : "active";
  const listPrice = priceForBillingInterval(plan, billingInterval);
  const priceOverride = options.priceOverride ?? null;
  const priceOverrideReason = options.priceOverrideReason?.trim() || null;
  const priceOverrideEndsAt = options.priceOverrideEndsAt || null;

  if (priceOverride !== null && (!Number.isFinite(priceOverride) || priceOverride < 0)) {
    return { ok: false, error: "Contract price must be zero or greater." };
  }
  if (priceOverride !== null && priceOverride > listPrice) {
    return { ok: false, error: "Contract price cannot exceed the selected plan price." };
  }
  if (priceOverride !== null && !priceOverrideReason) {
    return { ok: false, error: "Add a reason for the discounted contract price." };
  }

  const existing = await fetchSubscription(admin, restaurantId);

  let subscription: Subscription;
  if (existing) {
    const { data, error } = await admin
      .from("subscriptions")
      .update(
        buildContractChangePatch({
          planId,
          billingInterval,
          priceOverride,
          priceOverrideReason,
          priceOverrideEndsAt,
          actorUserId: options.actor.userId,
          changedAt: new Date().toISOString()
        })
      )
      .eq("id", existing.id)
      .eq("restaurant_id", restaurantId)
      .select("*")
      .single();
    if (error) {
      return { ok: false, error: error.message };
    }
    subscription = data as Subscription;
    if (
      Number(existing.price_override ?? -1) !== Number(priceOverride ?? -1) ||
      existing.price_override_reason !== priceOverrideReason ||
      existing.price_override_ends_at !== priceOverrideEndsAt
    ) {
      const { error: priceEventError } = await admin.from("subscription_price_events").insert({
        restaurant_id: restaurantId,
        subscription_id: subscription.id,
        previous_price: existing.price_override,
        new_price: priceOverride,
        billing_interval: billingInterval,
        reason: priceOverrideReason || "Contract price returned to plan price",
        ends_at: priceOverrideEndsAt,
        actor_user_id: options.actor.userId,
        actor_role: options.actor.role
      });
      if (priceEventError) {
        return { ok: false, error: priceEventError.message };
      }
    }
  } else {
    const { data, error } = await admin
      .from("subscriptions")
      .insert({
        restaurant_id: restaurantId,
        plan_id: planId,
        status,
        billing_interval: billingInterval,
        price_override: priceOverride,
        price_override_reason: priceOverrideReason,
        price_override_ends_at: priceOverrideEndsAt,
        price_override_created_by: priceOverride !== null ? options.actor.userId : null,
        price_override_updated_at: priceOverride !== null ? new Date().toISOString() : null,
        billing_cycle_start: cycleStart,
        billing_cycle_end: cycleEnd,
        trial_ends_at: startTrial
          ? new Date(`${addDays(todayStr, TRIAL_DAYS)}T00:00:00.000Z`).toISOString()
          : null
      })
      .select("*")
      .single();
    if (error) {
      return { ok: false, error: error.message };
    }
    subscription = data as Subscription;
    const { error: statusEventError } = await admin.from("subscription_status_events").insert({
      restaurant_id: restaurantId,
      subscription_id: subscription.id,
      from_status: null,
      to_status: status,
      reason: `Enrolled on ${plan.code} (${billingInterval})${startTrial ? " (trial)" : ""}`,
      actor_user_id: options.actor.userId,
      actor_role: options.actor.role
    });
    if (statusEventError) {
      return { ok: false, error: statusEventError.message };
    }
    if (priceOverride !== null) {
      const { error: priceEventError } = await admin.from("subscription_price_events").insert({
        restaurant_id: restaurantId,
        subscription_id: subscription.id,
        previous_price: null,
        new_price: priceOverride,
        billing_interval: billingInterval,
        reason: priceOverrideReason,
        ends_at: priceOverrideEndsAt,
        actor_user_id: options.actor.userId,
        actor_role: options.actor.role
      });
      if (priceEventError) {
        return { ok: false, error: priceEventError.message };
      }
    }
  }

  if (!existing && !startTrial) {
    await issueInvoiceForPeriod(admin, {
      subscription,
      plan,
      periodStart: cycleStart,
      periodEnd: cycleEnd,
      issuedDate: todayStr,
      description:
        billingInterval === "yearly"
          ? `${plan.name} annual plan — ${cycleStart} to ${cycleEnd}`
          : `${plan.name} plan — ${periodLabel(cycleStart)}`,
      descriptionAr: plan.name_ar
        ? billingInterval === "yearly"
          ? `${plan.name_ar} — ${cycleStart} to ${cycleEnd}`
          : `${plan.name_ar} — ${periodLabel(cycleStart)}`
        : null
    });
  }

  return { ok: true, data: { subscriptionId: subscription.id } };
}

// Manually issue an invoice for the current period (e.g. negotiated
// multi-branch amount). Idempotent on the period.
export async function issueCurrentPeriodInvoice(
  restaurantId: string,
  options: { unitAmount?: number; description?: string; actor: BillingActor }
): Promise<BillingResult> {
  const admin = getAdmin();
  const subscription = await fetchSubscription(admin, restaurantId);
  if (!subscription) {
    return { ok: false, error: "This restaurant has no subscription yet." };
  }
  const plan = await fetchPlan(admin, subscription.plan_id);
  if (!plan) {
    return { ok: false, error: "Plan not found." };
  }

  const description = options.description?.trim() || "";
  const effectivePrice = priceForSubscription(plan, subscription, today());
  if (
    options.unitAmount !== undefined &&
    Math.abs(options.unitAmount - effectivePrice) >= 0.005 &&
    !description
  ) {
    return {
      ok: false,
      error: "Add a description when the invoice amount differs from the contract price."
    };
  }

  await issueInvoiceForPeriod(admin, {
    subscription,
    plan,
    periodStart: subscription.billing_cycle_start,
    periodEnd: subscription.billing_cycle_end,
    issuedDate: today(),
    description:
      description ||
      (subscription.billing_interval === "yearly"
        ? `${plan.name} annual plan — ${subscription.billing_cycle_start} to ${subscription.billing_cycle_end}`
        : `${plan.name} plan — ${periodLabel(subscription.billing_cycle_start)}`),
    unitAmount: options.unitAmount
  });

  return { ok: true };
}

export async function voidInvoice(
  restaurantId: string,
  invoiceId: string,
  reason: string,
  actor: BillingActor
): Promise<BillingResult> {
  const admin = getAdmin();
  const { error } = await admin.rpc("void_billing_invoice", {
    p_restaurant_id: restaurantId,
    p_invoice_id: invoiceId,
    p_reason: reason,
    p_actor_user_id: actor.userId
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// Record a received payment (bank transfer / cash). Settles the invoice when
// payments reach its total, and heals past_due/suspended/trialing → active.
export async function recordPayment(
  restaurantId: string,
  invoiceId: string,
  input: {
    amount: number;
    method: Payment["method"];
    reference?: string | null;
    receivedAt?: string;
    idempotencyKey: string;
    actor: BillingActor;
  }
): Promise<BillingResult> {
  const admin = getAdmin();
  if (!(input.amount > 0)) {
    return { ok: false, error: "Payment amount must be greater than zero." };
  }

  if (!input.idempotencyKey) {
    return { ok: false, error: "Payment request key is missing. Refresh and try again." };
  }
  const { error } = await admin.rpc("record_billing_payment", {
    p_restaurant_id: restaurantId,
    p_invoice_id: invoiceId,
    p_amount: input.amount,
    p_method: input.method,
    p_reference: input.reference?.trim() || null,
    p_received_at: input.receivedAt
      ? new Date(input.receivedAt).toISOString()
      : new Date().toISOString(),
    p_actor_user_id: input.actor.userId,
    p_idempotency_key: input.idempotencyKey
  });
  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

// Manual super-admin status override (concierge escape hatch). Keeps the audit
// trail and the grace/cancel side fields consistent with the new status.
export async function changeStatusManually(
  restaurantId: string,
  toStatus: SubscriptionStatus,
  reason: string,
  actor: BillingActor
): Promise<BillingResult> {
  const admin = getAdmin();
  const subscription = await fetchSubscription(admin, restaurantId);
  if (!subscription) {
    return { ok: false, error: "This restaurant has no subscription yet." };
  }

  if (toStatus === "active") {
    const { count, error } = await admin
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("status", "issued")
      .lt("due_at", new Date().toISOString());
    if (error) {
      return { ok: false, error: error.message };
    }
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        error: "Settle or void overdue invoices before changing this subscription to active."
      };
    }
  }

  const patch: Partial<Subscription> = {};
  if (toStatus === "past_due") {
    patch.grace_until = addDays(today(), GRACE_DAYS);
  } else if (toStatus === "active") {
    patch.grace_until = null;
    patch.cancel_at_period_end = false;
    patch.cancelled_at = null;
  } else if (toStatus === "cancelled") {
    patch.cancelled_at = new Date().toISOString();
  }

  await transitionStatus(
    admin,
    subscription,
    toStatus,
    reason.trim() || "Manual status change by super admin",
    actor,
    patch
  );

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Daily cron (§9). Renew → generate → age → suspend → close. Idempotent: a
// double-run never double-bills (invoice idempotency_key) and only transitions
// subscriptions out of their source state, so re-running is a no-op.
//
// The cron only generates and ages. It NEVER touches the customer ordering PWA
// (accepting_orders / is_active) — suspension soft-blocks admin surfaces only.
// ---------------------------------------------------------------------------
export type BillingCronSummary = {
  trialConverted: number;
  renewed: number;
  invoicesIssued: number;
  aged: number;
  suspended: number;
  cancelled: number;
};

const CRON_ACTOR: BillingActor = { userId: null, role: "system" };

export async function runDailyBilling(now: Date = new Date()): Promise<BillingCronSummary> {
  const admin = getAdmin();
  const todayStr = toDateString(now);
  const nowIso = now.toISOString();
  const summary: BillingCronSummary = {
    trialConverted: 0,
    renewed: 0,
    invoicesIssued: 0,
    aged: 0,
    suspended: 0,
    cancelled: 0
  };

  // 1. Trial conversion: trial elapsed → active, enrolled into the calendar
  //    cycle. Stub days until the next 1st are free; first invoice issues on
  //    the next renewal pass.
  const { data: trialing } = await admin
    .from("subscriptions")
    .select("*")
    .eq("status", "trialing")
    .not("trial_ends_at", "is", null)
    .lte("trial_ends_at", nowIso);
  for (const subscription of (trialing as Subscription[] | null) ?? []) {
    const cycle = billingCycleFor(subscription.billing_interval, todayStr);
    await transitionStatus(admin, subscription, "active", "Trial ended", CRON_ACTOR, {
      billing_cycle_start: cycle.start,
      billing_cycle_end: cycle.end,
      trial_ends_at: null
    });
    summary.trialConverted += 1;
  }

  // 2. Renew + generate: period ended and not cancelling → roll to the new
  //    calendar month and issue the next invoice (idempotent).
  const { data: dueForRenewal } = await admin
    .from("subscriptions")
    .select("*")
    .in("status", ["active", "past_due"])
    .eq("cancel_at_period_end", false)
    .lt("billing_cycle_end", todayStr);
  for (const subscription of (dueForRenewal as Subscription[] | null) ?? []) {
    const plan = await fetchPlan(admin, subscription.plan_id);
    if (!plan) {
      continue;
    }
    const cycle = billingCycleFor(subscription.billing_interval, todayStr);
    const periodStart = cycle.start;
    const periodEnd = cycle.end;

    const { data: rolled } = await admin
      .from("subscriptions")
      .update({ billing_cycle_start: periodStart, billing_cycle_end: periodEnd })
      .eq("id", subscription.id)
      .eq("restaurant_id", subscription.restaurant_id)
      .select("*")
      .single();
    summary.renewed += 1;

    const { data: priorInvoice } = await admin
      .from("invoices")
      .select("id")
      .eq("idempotency_key", invoiceIdempotencyKey(subscription.id, periodStart))
      .maybeSingle();

    await issueInvoiceForPeriod(admin, {
      subscription: (rolled as Subscription | null) ?? subscription,
      plan,
      periodStart,
      periodEnd,
      issuedDate: todayStr,
      description:
        subscription.billing_interval === "yearly"
          ? `${plan.name} annual plan — ${periodStart} to ${periodEnd}`
          : `${plan.name} plan — ${periodLabel(periodStart)}`,
      descriptionAr: plan.name_ar
        ? subscription.billing_interval === "yearly"
          ? `${plan.name_ar} — ${periodStart} to ${periodEnd}`
          : `${plan.name_ar} — ${periodLabel(periodStart)}`
        : null
    });
    if (!priorInvoice) {
      summary.invoicesIssued += 1;
    }
  }

  // 3. Age overdue: issued invoices past due_at → subscription past_due, with a
  //    grace window. Only active subscriptions transition (idempotent re-runs).
  const { data: overdue } = await admin
    .from("invoices")
    .select("id,subscription_id,restaurant_id,due_at,invoice_number")
    .eq("status", "issued")
    .lt("due_at", nowIso);
  for (const invoice of (overdue as Array<{
    subscription_id: string;
    restaurant_id: string;
    due_at: string | null;
    invoice_number: string;
  }> | null) ?? []) {
    const subscription = await fetchSubscription(admin, invoice.restaurant_id);
    if (!subscription || subscription.status !== "active") {
      continue;
    }
    const dueDate = (invoice.due_at ?? nowIso).slice(0, 10);
    await transitionStatus(
      admin,
      subscription,
      "past_due",
      `Invoice ${invoice.invoice_number} past due`,
      CRON_ACTOR,
      { grace_until: addDays(dueDate, GRACE_DAYS) }
    );
    summary.aged += 1;
  }

  // 4. Suspend: grace window elapsed while still past_due → suspended
  //    (admin soft-block only; customer ordering stays live).
  const { data: toSuspend } = await admin
    .from("subscriptions")
    .select("*")
    .eq("status", "past_due")
    .not("grace_until", "is", null)
    .lt("grace_until", todayStr);
  for (const subscription of (toSuspend as Subscription[] | null) ?? []) {
    await transitionStatus(
      admin,
      subscription,
      "suspended",
      "Grace period elapsed without payment",
      CRON_ACTOR
    );
    summary.suspended += 1;
  }

  // 5. Close cancellations: cancel-at-period-end subs whose period ended.
  const { data: toClose } = await admin
    .from("subscriptions")
    .select("*")
    .eq("cancel_at_period_end", true)
    .neq("status", "cancelled")
    .lt("billing_cycle_end", todayStr);
  for (const subscription of (toClose as Subscription[] | null) ?? []) {
    await transitionStatus(
      admin,
      subscription,
      "cancelled",
      "Cancellation closed at period end",
      CRON_ACTOR,
      { cancelled_at: nowIso }
    );
    summary.cancelled += 1;
  }

  return summary;
}
