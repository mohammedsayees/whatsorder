import type { CartLine, FulfilmentType } from "@/lib/types";

// The staff punch screen submits orders as a plain payload (not FormData) so
// the exact same object can be sent live, queued in the device outbox during
// an internet outage, and replayed later through the same server action.

export const STAFF_ORDER_ACTIONS = ["kitchen", "paid_cash", "paid_card"] as const;

export type StaffOrderActionKind = (typeof STAFF_ORDER_ACTIONS)[number];

export type StaffOrderPayload = {
  // Client-generated idempotency key: replaying a queued order (or retrying
  // after a timeout whose request actually landed) can never double-punch.
  clientOrderId: string;
  // Guard only — the server always writes under the session's restaurant and
  // rejects the payload if a stale queue meets a different restaurant login.
  restaurantId: string;
  // When staff actually punched the order, which after an outage can be hours
  // before the row reaches the database.
  punchedAt: string;
  action: StaffOrderActionKind;
  fulfilmentType: FulfilmentType;
  items: CartLine[];
  tableNumber: string;
  deliveryArea: string;
  deliveryAddress: string;
  deliveryLandmark: string;
  carPlateNumber: string;
  carDescription: string;
  customerName: string;
  customerPhone: string;
  notes: string;
};

export function isStaffOrderActionKind(value: unknown): value is StaffOrderActionKind {
  return STAFF_ORDER_ACTIONS.includes(value as StaffOrderActionKind);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isClientOrderId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

// Devices queue orders with their own clock. Accept up to a week of backlog;
// anything unparseable, in the future, or older is recorded as "now" so a bad
// clock cannot plant orders outside the plausible outage window.
const MAX_PUNCH_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function clampPunchedAt(raw: unknown, now: Date = new Date()): string {
  const parsed = typeof raw === "string" ? Date.parse(raw) : Number.NaN;

  if (
    Number.isNaN(parsed) ||
    parsed > now.getTime() ||
    parsed < now.getTime() - MAX_PUNCH_AGE_MS
  ) {
    return now.toISOString();
  }

  return new Date(parsed).toISOString();
}

// Matches the partial unique index from the offline_staff_orders migration.
export function isDuplicateClientOrderError(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  return (
    error?.code === "23505" &&
    (error.message ?? "").includes("orders_restaurant_client_order_key")
  );
}

export function payloadField(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
