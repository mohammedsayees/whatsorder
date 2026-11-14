// WhatsOrder Billing Engine — Phase 1 pure logic.
//
// Pure, side-effect-free helpers and types shared by the server data layer,
// the daily cron, and the super-admin UI. Database access lives in
// billing-data.ts (server-only); keep this file importable from anywhere and
// fully unit-testable.

// ---------------------------------------------------------------------------
// Resolved Phase 1 config (Feature Brief §13). Baked in, not yet tenant-tunable.
// ---------------------------------------------------------------------------
export const TRIAL_DAYS = 30; // signup-anchored free trial
export const NET_TERMS_DAYS = 7; // invoice issued → due_at
export const GRACE_DAYS = 14; // due_at → suspend (~21 days issue→suspend)
export const DEFAULT_VAT_RATE = 0; // WhatsOrder not VAT-registered yet
export const DEFAULT_CURRENCY = "AED";
export const INVOICE_NUMBER_PREFIX = "WO";

// ---------------------------------------------------------------------------
// Status enums (mirror the Postgres enums in the billing migration).
// ---------------------------------------------------------------------------
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "suspended"
  | "cancelled";

export type InvoiceStatus = "draft" | "issued" | "paid" | "void";

export type PaymentMethod = "bank_transfer" | "cash" | "cheque" | "other";

export type BillingInterval = "monthly" | "yearly";

export const PAYMENT_METHODS: PaymentMethod[] = [
  "bank_transfer",
  "cash",
  "cheque",
  "other"
];

// One derived access level the rest of the app branches on — never the raw
// billing tables (Feature Brief §7).
export type AccessLevel = "full" | "read_only_warning" | "soft_blocked";

// ---------------------------------------------------------------------------
// Plan feature flags. Only these gate entitlement; core features are unflagged
// and available on every tier.
// ---------------------------------------------------------------------------
export type PlanFeatures = {
  campaigns: boolean;
  advanced_analytics: boolean;
  scheduled_orders: boolean;
  multi_branch: boolean;
  group_reporting: boolean;
  shared_menu: boolean;
  // WhatsApp chat inbox + AI auto-reply (pricing v2, Growth and up).
  chat_inbox: boolean;
  // Finance, costing and the bill scanner (pricing v2, Growth and up).
  finance: boolean;
};

export type PlanFeatureFlag = keyof PlanFeatures;

const DEFAULT_PLAN_FEATURES: PlanFeatures = {
  campaigns: false,
  advanced_analytics: false,
  scheduled_orders: false,
  multi_branch: false,
  group_reporting: false,
  shared_menu: false,
  chat_inbox: false,
  finance: false
};

// Trialing tenants try the Growth feature set whatever plan they signed up
// for, so they see the full value before choosing (pricing v2).
export const TRIAL_FEATURES: Partial<PlanFeatures> = {
  campaigns: true,
  advanced_analytics: true,
  scheduled_orders: true,
  chat_inbox: true,
  finance: true
};
export const TRIAL_MONTHLY_AI_IMAGE_LIMIT = 100;

// ---------------------------------------------------------------------------
// Row types (match the migration columns).
// ---------------------------------------------------------------------------
export type Plan = {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  monthly_price: number;
  annual_price: number;
  currency: string;
  max_branches: number | null;
  max_staff: number | null;
  // AI images (menu editor + poster art) per UAE calendar month; null = no
  // monthly cap (per-day caps still apply).
  monthly_ai_image_limit?: number | null;
  features: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Subscription = {
  id: string;
  restaurant_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_interval: BillingInterval;
  price_override: number | null;
  price_override_reason: string | null;
  price_override_ends_at: string | null;
  price_override_created_by: string | null;
  price_override_updated_at: string | null;
  billing_cycle_start: string;
  billing_cycle_end: string;
  trial_ends_at: string | null;
  grace_until: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  // Per-contract overrides merged over the plan (grandfathering, custom deals).
  feature_overrides?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceLineItem = {
  id: string;
  restaurant_id: string;
  invoice_id: string;
  description: string;
  description_ar: string | null;
  quantity: number;
  unit_amount: number;
  line_total: number;
  created_at: string;
};

export type Invoice = {
  id: string;
  restaurant_id: string;
  subscription_id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  currency: string;
  status: InvoiceStatus;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  void_reason: string | null;
  voided_at: string | null;
  voided_by_user_id: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
};

export type Payment = {
  id: string;
  restaurant_id: string;
  invoice_id: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  received_at: string;
  recorded_by_user_id: string | null;
  idempotency_key: string;
  created_at: string;
};

// What the app reads (Feature Brief §7).
export type TenantAccess = {
  access: AccessLevel;
  status: SubscriptionStatus | null;
  plan_code: string | null;
  plan_name: string | null;
  plan_features: PlanFeatures;
  limits: {
    max_branches: number | null;
    max_staff: number | null;
    monthly_ai_images: number | null;
  };
};

export type ContractChangePatch = Pick<
  Subscription,
  | "plan_id"
  | "billing_interval"
  | "price_override"
  | "price_override_reason"
  | "price_override_ends_at"
  | "price_override_created_by"
  | "price_override_updated_at"
>;

// Existing-contract edits deliberately exclude status and cycle fields. A plan
// or discount change must never heal arrears, restart a trial, or replace the
// invoice period already in progress.
export function buildContractChangePatch(input: {
  planId: string;
  billingInterval: BillingInterval;
  priceOverride: number | null;
  priceOverrideReason: string | null;
  priceOverrideEndsAt: string | null;
  actorUserId: string | null;
  changedAt: string;
}): ContractChangePatch {
  return {
    plan_id: input.planId,
    billing_interval: input.billingInterval,
    price_override: input.priceOverride,
    price_override_reason: input.priceOverrideReason,
    price_override_ends_at: input.priceOverrideEndsAt,
    price_override_created_by: input.priceOverride !== null ? input.actorUserId : null,
    price_override_updated_at: input.priceOverride !== null ? input.changedAt : null
  };
}

// ---------------------------------------------------------------------------
// Access mapping (Feature Brief §7).
//   trialing / active → full
//   past_due          → full access, with a warning banner (no functional loss)
//   suspended         → soft_blocked (admin surfaces only; ordering stays live)
//   cancelled         → soft_blocked
// `read_only_warning` is the "warning banner, still functional" level for
// past_due — it does NOT remove function (Feature Brief §8); it only signals.
// ---------------------------------------------------------------------------
export function deriveAccessLevel(status: SubscriptionStatus | null): AccessLevel {
  switch (status) {
    case "trialing":
    case "active":
      return "full";
    case "past_due":
      return "read_only_warning";
    case "suspended":
    case "cancelled":
      return "soft_blocked";
    default:
      // No subscription on record → don't lock anyone out; treat as full.
      return "full";
  }
}

// Suspended/cancelled tenants are soft-blocked from admin/management surfaces
// (menu editing, campaigns, staff). Customer ordering is NEVER gated here.
export function isManagementBlocked(access: AccessLevel): boolean {
  return access === "soft_blocked";
}

export function isPlanFeatureFlag(value: string): value is PlanFeatureFlag {
  return Object.prototype.hasOwnProperty.call(DEFAULT_PLAN_FEATURES, value);
}

// Whether a plan unlocks a gated feature flag.
export function isFeatureEnabled(features: PlanFeatures, flag: PlanFeatureFlag): boolean {
  return features[flag] === true;
}

// The one gate check pages and actions use. A tenant with no plan on record
// (an un-enrolled pilot) is never gated — billing must not break it.
export function tenantHasFeature(
  access: Pick<TenantAccess, "plan_code" | "plan_features">,
  flag: PlanFeatureFlag
): boolean {
  return !access.plan_code || access.plan_features[flag] === true;
}

// Effective features: plan flags, then trial upgrades, then per-contract
// overrides (which win, so a super admin can also switch a flag off).
export function resolveEntitlements(input: {
  planFeatures: Record<string, unknown> | null | undefined;
  planMonthlyAiImageLimit: number | null | undefined;
  overrides: Record<string, unknown> | null | undefined;
  status: SubscriptionStatus | null;
}): { features: PlanFeatures; monthlyAiImages: number | null } {
  const features = resolvePlanFeatures(input.planFeatures);
  let monthlyAiImages = normalizeLimit(input.planMonthlyAiImageLimit);

  if (input.status === "trialing") {
    Object.assign(features, TRIAL_FEATURES);
    if (monthlyAiImages !== null) {
      monthlyAiImages = Math.max(monthlyAiImages, TRIAL_MONTHLY_AI_IMAGE_LIMIT);
    }
  }

  const overrides = input.overrides;
  if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
    for (const key of Object.keys(features) as PlanFeatureFlag[]) {
      if (typeof overrides[key] === "boolean") {
        features[key] = overrides[key] as boolean;
      }
    }
    if ("monthly_ai_image_limit" in overrides) {
      const value = overrides.monthly_ai_image_limit;
      if (value === null) {
        monthlyAiImages = null;
      } else if (typeof value === "number") {
        monthlyAiImages = normalizeLimit(value);
      }
    }
  }

  return { features, monthlyAiImages };
}

function normalizeLimit(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

// Whether another AI image may be generated this month. Fails closed when
// usage could not be read (null) and a cap applies.
export function aiImageAllowanceRemaining(
  monthlyLimit: number | null,
  usedThisMonth: number | null
): boolean {
  if (monthlyLimit === null) {
    return true;
  }
  return usedThisMonth !== null && usedThisMonth < monthlyLimit;
}

// Resolve a plan's jsonb feature flags into a fully-typed object with safe
// false defaults, so callers never branch on an undefined flag.
export function resolvePlanFeatures(
  features: Record<string, unknown> | null | undefined
): PlanFeatures {
  const resolved: PlanFeatures = { ...DEFAULT_PLAN_FEATURES };
  if (!features) {
    return resolved;
  }
  for (const key of Object.keys(resolved) as PlanFeatureFlag[]) {
    if (typeof features[key] === "boolean") {
      resolved[key] = features[key] as boolean;
    }
  }
  return resolved;
}

// A tenant with no subscription/plan on record gets full access and no flags —
// billing must never be the thing that breaks an un-enrolled pilot tenant.
export const NO_SUBSCRIPTION_ACCESS: TenantAccess = {
  access: "full",
  status: null,
  plan_code: null,
  plan_name: null,
  plan_features: { ...DEFAULT_PLAN_FEATURES },
  limits: { max_branches: null, max_staff: null, monthly_ai_images: null }
};

// ---------------------------------------------------------------------------
// Invoice math.
// ---------------------------------------------------------------------------
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computeLineTotal(quantity: number, unitAmount: number): number {
  return roundMoney(quantity * unitAmount);
}

export function computeInvoiceTotals(
  lineItems: Array<{ line_total: number }>,
  vatRate: number
): { subtotal: number; vat_amount: number; total: number } {
  const subtotal = roundMoney(
    lineItems.reduce((sum, item) => sum + item.line_total, 0)
  );
  const vat_amount = roundMoney((subtotal * vatRate) / 100);
  const total = roundMoney(subtotal + vat_amount);
  return { subtotal, vat_amount, total };
}

// An invoice is settled once recorded payments reach its total (partial
// payments accumulate; status flips only on full settlement — §5).
export function isInvoiceSettled(total: number, paidToDate: number): boolean {
  return roundMoney(paidToDate) >= roundMoney(total);
}

// ---------------------------------------------------------------------------
// Date helpers — billing operates on calendar dates (YYYY-MM-DD). UAE has no
// DST, so plain UTC date math is stable for the Asia/Dubai calendar anchor.
// ---------------------------------------------------------------------------
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The platform billing calendar date: Asia/Dubai (UTC+4, no DST). A plain
 * UTC date is a day behind between 00:00 and 04:00 Dubai time, so invoices
 * issued or plans assigned then were dated yesterday. The daily cron runs at
 * 03:00 UTC (07:00 Dubai), where both agree.
 */
export function billingDateString(reference: Date = new Date()): string {
  return toDateString(new Date(reference.getTime() + 4 * 60 * 60 * 1000));
}

export function parseDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

export function addDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateString(date);
}

export function annualCycleEnd(value: string): string {
  const date = parseDate(value);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return addDays(toDateString(date), -1);
}

export function billingCycleFor(
  interval: BillingInterval,
  referenceDate: string
): { start: string; end: string } {
  if (interval === "yearly") {
    return { start: referenceDate, end: annualCycleEnd(referenceDate) };
  }

  return {
    start: firstOfMonth(referenceDate),
    end: lastOfMonth(referenceDate)
  };
}

export function priceForBillingInterval(
  plan: Pick<Plan, "monthly_price" | "annual_price">,
  interval: BillingInterval
): number {
  return Number(interval === "yearly" ? plan.annual_price : plan.monthly_price);
}

export function priceForSubscription(
  plan: Pick<Plan, "monthly_price" | "annual_price">,
  subscription: Pick<
    Subscription,
    "billing_interval" | "price_override" | "price_override_ends_at"
  >,
  referenceDate: string
): number {
  const overrideIsActive =
    subscription.price_override !== null &&
    (!subscription.price_override_ends_at ||
      subscription.price_override_ends_at >= referenceDate);

  return overrideIsActive
    ? Number(subscription.price_override)
    : priceForBillingInterval(plan, subscription.billing_interval);
}

export function firstOfMonth(value: string): string {
  const date = parseDate(value);
  return toDateString(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

export function lastOfMonth(value: string): string {
  const date = parseDate(value);
  return toDateString(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
  );
}

export function firstOfNextMonth(value: string): string {
  const date = parseDate(value);
  return toDateString(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
  );
}

// Idempotency key the cron and the manual issue path both use so a period is
// only ever billed once (§5 / §9).
export function invoiceIdempotencyKey(
  subscriptionId: string,
  periodStart: string
): string {
  return `${subscriptionId}:${periodStart}`;
}
