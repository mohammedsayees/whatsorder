import type {
  CartLine,
  FulfilmentType,
  Order,
  OrderStatus,
  PaymentMethod
} from "@/lib/types";

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

// How each punch action maps to a saved order's status/payment. Mirrored on
// the server (see createStaffOrderAction) and reused here so an offline KOT
// prints the same status the order will carry once it syncs.
const ACTION_OUTCOME: Record<
  StaffOrderActionKind,
  { status: OrderStatus; paymentMethod: PaymentMethod | null }
> = {
  kitchen: { status: "Preparing", paymentMethod: null },
  paid_cash: { status: "Completed", paymentMethod: "Cash on Delivery" },
  paid_card: { status: "Completed", paymentMethod: "Card on Delivery" }
};

// Projects a queued payload into an Order shape so the shared ticket renderer
// can print a KOT for an order that has not reached the server yet. Prices are
// only indicative here (the KOT hides them); the server re-prices on sync.
export function staffPayloadToPrintableOrder(payload: StaffOrderPayload): Order {
  const items = payload.items ?? [];
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.price) * Number(item.quantity),
    0
  );
  const outcome = ACTION_OUTCOME[payload.action] ?? ACTION_OUTCOME.kitchen;
  const createdAt = clampPunchedAt(payload.punchedAt);

  return {
    // Use the client order id as the reference so the printed KOT and the
    // synced order share the same tail (orderReference = last 8 chars).
    id: payload.clientOrderId,
    restaurant_id: payload.restaurantId,
    shift_id: null,
    customer_name: payload.customerName || "Walk-in customer",
    customer_phone: payload.customerPhone,
    fulfilment_type: payload.fulfilmentType,
    car_plate_number: payload.carPlateNumber || null,
    car_description: payload.carDescription || null,
    table_number: payload.tableNumber || null,
    delivery_area: payload.deliveryArea || null,
    delivery_address: payload.deliveryAddress || null,
    delivery_latitude: null,
    delivery_longitude: null,
    delivery_google_maps_url: null,
    delivery_place_id: null,
    delivery_address_text: null,
    delivery_landmark: payload.deliveryLandmark || null,
    notes: payload.notes || null,
    payment_method: outcome.paymentMethod,
    items,
    subtotal,
    delivery_fee: 0,
    total: subtotal,
    points_earned: 0,
    points_redeemed: 0,
    loyalty_discount: 0,
    status: outcome.status,
    source: "staff",
    whatsapp_message: "",
    consent_order_processing: true,
    consent_marketing: false,
    consent_timestamp: createdAt,
    created_at: createdAt,
    updated_at: createdAt
  };
}
