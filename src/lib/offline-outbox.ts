import type { StaffOrderPayload } from "@/lib/staff-order-payload";

// Device-local outbox for staff-punched orders (IndexedDB, browser only).
// When the internet is down or too slow, the punch screen stores the exact
// server-action payload here and replays it once connectivity returns. The
// server's client_order_id unique index keeps replays idempotent, so entries
// are only removed after the server confirms the order (or reports it as a
// duplicate of an earlier attempt that actually landed).

export type QueuedStaffOrder = {
  clientOrderId: string;
  restaurantId: string;
  queuedAt: string;
  attempts: number;
  // "queued" entries auto-sync; "failed" entries were rejected by the server
  // (e.g. an item went unavailable while offline) and wait for staff to retry
  // or discard them.
  status: "queued" | "failed";
  lastError: string | null;
  // Snapshot of the ticket total for display — the server still re-prices.
  displayTotal: number;
  payload: StaffOrderPayload;
};

const DB_NAME = "whatsorder-staff";
const DB_VERSION = 1;
const STORE = "queued_orders";

export function isOutboxSupported(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "clientOrderId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();

  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function enqueueOrder(
  payload: StaffOrderPayload,
  displayTotal: number
): Promise<void> {
  const entry: QueuedStaffOrder = {
    clientOrderId: payload.clientOrderId,
    restaurantId: payload.restaurantId,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    status: "queued",
    lastError: null,
    displayTotal,
    payload
  };

  await withStore("readwrite", (store) => store.put(entry));
}

// Only this restaurant's queue — a shared device that has been logged into
// another tenant must not surface (or sync) the other tenant's orders.
export async function listQueuedOrders(
  restaurantId: string
): Promise<QueuedStaffOrder[]> {
  const all = await withStore<QueuedStaffOrder[]>("readonly", (store) =>
    store.getAll()
  );

  return all
    .filter((entry) => entry.restaurantId === restaurantId)
    .sort((first, second) => first.queuedAt.localeCompare(second.queuedAt));
}

export async function removeQueuedOrder(clientOrderId: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(clientOrderId));
}

export async function updateQueuedOrder(
  clientOrderId: string,
  changes: Partial<Pick<QueuedStaffOrder, "status" | "lastError" | "attempts">>
): Promise<void> {
  const entry = await withStore<QueuedStaffOrder | undefined>(
    "readonly",
    (store) => store.get(clientOrderId)
  );

  if (!entry) {
    return;
  }

  await withStore("readwrite", (store) => store.put({ ...entry, ...changes }));
}
