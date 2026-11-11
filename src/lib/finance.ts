export const FINANCE_CLASSIFICATIONS = [
  "operating",
  "purchase",
  "capex",
  "loan",
  "owner",
  "tax",
  "other"
] as const;

export const FINANCE_FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly"] as const;

export type FinanceClassification = (typeof FINANCE_CLASSIFICATIONS)[number];
export type FinanceFrequency = (typeof FINANCE_FREQUENCIES)[number];
export type FinancePermission =
  | "view"
  | "create"
  | "approve"
  | "manage_categories"
  | "manage_recurring"
  | "manage_costing"
  | "view_reports"
  | "manage_permissions";

export type FinanceAccess = Record<FinancePermission, boolean>;

export type FinanceRolePermissionRow = {
  role: "manager" | "staff";
  can_view: boolean;
  can_create: boolean;
  can_approve: boolean;
  can_manage_categories: boolean;
  can_manage_recurring: boolean;
  can_manage_costing: boolean;
  can_view_reports: boolean;
};

export type FinanceCategory = {
  id: string;
  restaurant_id: string;
  name: string;
  classification: FinanceClassification;
  default_allocation_months: number;
  is_active: boolean;
};

export type FinanceExpense = {
  id: string;
  restaurant_id: string;
  category_id: string;
  description: string;
  supplier_name: string | null;
  incurred_on: string;
  subtotal_fils: number;
  input_vat_fils: number;
  total_fils: number;
  vat_inclusive: boolean;
  status: "draft" | "approved" | "void";
  payment_status: "unpaid" | "paid" | "partial";
  payment_method: "cash" | "card" | "bank_transfer" | "other" | null;
  paid_on: string | null;
  created_at: string;
  finance_categories?: Pick<FinanceCategory, "name" | "classification"> | null;
};

export type FinanceRecurringCost = {
  id: string;
  restaurant_id: string;
  category_id: string;
  description: string;
  amount_fils: number;
  frequency: FinanceFrequency;
  allocation_months: number;
  start_on: string;
  end_on: string | null;
  next_due_on: string;
  is_active: boolean;
  finance_categories?: Pick<FinanceCategory, "name" | "classification"> | null;
};

const fullAccess: FinanceAccess = {
  view: true,
  create: true,
  approve: true,
  manage_categories: true,
  manage_recurring: true,
  manage_costing: true,
  view_reports: true,
  manage_permissions: true
};

const noAccess: FinanceAccess = {
  view: false,
  create: false,
  approve: false,
  manage_categories: false,
  manage_recurring: false,
  manage_costing: false,
  view_reports: false,
  manage_permissions: false
};

export function resolveFinanceAccess(
  featureEnabled: boolean,
  role: "restaurant_admin" | "owner" | "manager" | "staff",
  configured?: FinanceRolePermissionRow | null
): FinanceAccess {
  if (!featureEnabled) return { ...noAccess };
  if (role === "restaurant_admin" || role === "owner") return { ...fullAccess };
  if (!configured || configured.role !== role) return { ...noAccess };

  return {
    view: configured.can_view,
    create: configured.can_create,
    approve: configured.can_view && configured.can_approve,
    manage_categories: configured.can_view && configured.can_manage_categories,
    manage_recurring: configured.can_view && configured.can_manage_recurring,
    manage_costing: configured.can_view && configured.can_manage_costing,
    view_reports: configured.can_view && configured.can_view_reports,
    manage_permissions: false
  };
}

export function parseAedToFilsAllowZero(value: unknown): number | null {
  const normalized = String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d{0,10})(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const fils = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(fils) && fils >= 0 ? fils : null;
}

export function parseAedToFils(value: unknown): number | null {
  const fils = parseAedToFilsAllowZero(value);
  return fils !== null && fils > 0 ? fils : null;
}

export function formatFils(value: number, currency = "AED") {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value / 100);
}

export function splitInclusiveVat(totalFils: number, rateNumerator = 5, rateDenominator = 100) {
  if (!Number.isSafeInteger(totalFils) || totalFils < 0) throw new Error("Invalid total fils.");
  const vatFils = Math.round((totalFils * rateNumerator) / (rateDenominator + rateNumerator));
  return { subtotalFils: totalFils - vatFils, vatFils, totalFils };
}

export function monthlyAllocationSchedule(amountFils: number, months: number): number[] {
  if (!Number.isSafeInteger(amountFils) || amountFils <= 0) throw new Error("Invalid amount fils.");
  if (!Number.isInteger(months) || months < 1 || months > 120) throw new Error("Invalid allocation months.");
  const base = Math.floor(amountFils / months);
  const remainder = amountFils % months;
  return Array.from({ length: months }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function requiredText(value: unknown, maximum: number) {
  const text = String(value ?? "").trim();
  return text.length > 0 && text.length <= maximum ? text : null;
}
