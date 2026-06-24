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
};

export type PlanFeatureFlag = keyof PlanFeatures;

const DEFAULT_PLAN_FEATURES: PlanFeatures = {
  campaigns: false,
  advanced_analytics: false,
  scheduled_orders: false,
  multi_branch: false,
  group_reporting: false,
  shared_menu: false
};

// ---------------------------------------------------------------------------
// Row types (match the migration columns).
// ---------------------------------------------------------------------------
export type Plan = {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  monthly_price: number;
  currency: string;
  max_branches: number | null;
  max_staff: number | null;
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
  billing_cycle_start: string;
  billing_cycle_end: string;
  trial_ends_at: string | null;
  grace_until: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
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
  created_at: string;
};

// What the app reads (Feature Brief §7).
export type TenantAccess = {
  access: AccessLevel;
  status: SubscriptionStatus | null;
  plan_code: string | null;
  plan_name: string | null;
  plan_features: PlanFeatures;
  limits: { max_branches: number | null; max_staff: number | null };
};

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

// Whether a plan unlocks a gated feature flag.
export function isFeatureEnabled(features: PlanFeatures, flag: PlanFeatureFlag): boolean {
  return features[flag] === true;
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
  limits: { max_branches: null, max_staff: null }
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

export function parseDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

export function addDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateString(date);
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
