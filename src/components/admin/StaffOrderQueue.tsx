"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CloudOff, RefreshCw, Trash2 } from "lucide-react";
import { submitStaffOrderAction } from "@/app/admin/orders/actions";
import { formatOrderItemName } from "@/lib/cart-line";
import { formatAED } from "@/lib/currency";
import {
  enqueueOrder,
  isOutboxSupported,
  listQueuedOrders,
  removeQueuedOrder,
  updateQueuedOrder,
  type QueuedStaffOrder
} from "@/lib/offline-outbox";
import type { StaffOrderActionKind, StaffOrderPayload } from "@/lib/staff-order-payload";

// Sync replays wait longer than a live punch: nothing is blocked on them, and
// slow connections deserve the extra patience before we call it unreachable.
const SYNC_TIMEOUT_MS = 15_000;
const SYNC_RETRY_INTERVAL_MS = 20_000;

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Request timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        clearTimeout(timer);
        reject(reason);
      }
    );
  });
}

export function useStaffOrderQueue(restaurantId: string) {
  const [queue, setQueue] = useState<QueuedStaffOrder[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const flushing = useRef(false);

  const refresh = useCallback(async () => {
    if (!isOutboxSupported()) {
      return;
    }
    setQueue(await listQueuedOrders(restaurantId));
  }, [restaurantId]);

  const flush = useCallback(async () => {
    if (!isOutboxSupported() || flushing.current) {
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return;
    }

    flushing.current = true;

    try {
      const pending = (await listQueuedOrders(restaurantId)).filter(
        (entry) => entry.status === "queued"
      );

      for (const entry of pending) {
        setSyncingId(entry.clientOrderId);

        try {
          const result = await withTimeout(
            submitStaffOrderAction(entry.payload),
            SYNC_TIMEOUT_MS
          );

          if (result.error) {
            // The server rejected the order (menu changed, login switched…).
            // Park it as failed for staff to retry or discard — do not drop it.
            await updateQueuedOrder(entry.clientOrderId, {
              status: "failed",
              lastError: result.error,
              attempts: entry.attempts + 1
            });
          } else {
            await removeQueuedOrder(entry.clientOrderId);
          }
        } catch {
          // Still unreachable — keep the entry queued and stop this round.
          await updateQueuedOrder(entry.clientOrderId, {
            attempts: entry.attempts + 1
          });
          break;
        }
      }
    } finally {
      flushing.current = false;
      setSyncingId(null);
      await refresh();
    }
  }, [refresh, restaurantId]);

  const enqueue = useCallback(
    async (payload: StaffOrderPayload, displayTotal: number) => {
      if (!isOutboxSupported()) {
        throw new Error("offline-outbox-unsupported");
      }
      await enqueueOrder(payload, displayTotal);
      await refresh();
    },
    [refresh]
  );

  const retry = useCallback(
    async (clientOrderId: string) => {
      await updateQueuedOrder(clientOrderId, { status: "queued", lastError: null });
      await refresh();
      void flush();
    },
    [flush, refresh]
  );

  const discard = useCallback(
    async (clientOrderId: string) => {
      await removeQueuedOrder(clientOrderId);
      await refresh();
    },
    [refresh]
  );

  useEffect(() => {
    void refresh().then(() => flush());

    const handleOnline = () => void flush();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [flush, refresh]);

  // Keep retrying while anything is queued — covers "online but flaky", where
  // the browser never fires an offline/online transition.
  const hasQueued = queue.some((entry) => entry.status === "queued");

  useEffect(() => {
    if (!hasQueued) {
      return;
    }
    const timer = setInterval(() => void flush(), SYNC_RETRY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [flush, hasQueued]);

  return { queue, syncingId, enqueue, retry, discard };
}

const actionLabels: Record<StaffOrderActionKind, string> = {
  kitchen: "To kitchen",
  paid_cash: "Paid · Cash",
  paid_card: "Paid · Card"
};

function punchTimeLabel(isoTime: string) {
  const parsed = new Date(isoTime);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// The offline record the kitchen works from during an outage: every queued
// ticket stays readable here (items, type, total) until it reaches the server.
export function QueuedOrdersPanel({
  queue,
  syncingId,
  onRetry,
  onDiscard
}: {
  queue: QueuedStaffOrder[];
  syncingId: string | null;
  onRetry: (clientOrderId: string) => void;
  onDiscard: (clientOrderId: string) => void;
}) {
  if (queue.length === 0) {
    return null;
  }

  return (
    <section
      aria-live="polite"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4"
    >
      <div className="flex items-center gap-2">
        <CloudOff className="shrink-0 text-amber-700" size={18} />
        <h2 className="text-sm font-black text-amber-900">
          {queue.length} order{queue.length === 1 ? "" : "s"} saved on this
          device — waiting to sync
        </h2>
      </div>
      <p className="mt-1 text-xs font-bold text-amber-800">
        They will send automatically when the internet returns. Keep this page
        open and prepare the tickets from the list below.
      </p>

      <ul className="mt-3 space-y-2">
        {queue.map((entry) => {
          const itemsSummary = entry.payload.items
            .map((item) => `${item.quantity}x ${formatOrderItemName(item)}`)
            .join(", ");
          const syncing = syncingId === entry.clientOrderId;

          return (
            <li
              className="rounded-lg border border-amber-200 bg-white px-3 py-2"
              key={entry.clientOrderId}
            >
              <div className="flex items-center justify-between gap-2 text-xs font-black text-stone-500">
                <span>
                  {punchTimeLabel(entry.payload.punchedAt)} ·{" "}
                  {actionLabels[entry.payload.action]}
                </span>
                <span>{formatAED(entry.displayTotal)}</span>
              </div>
              <p className="mt-1 text-sm font-bold">{itemsSummary}</p>

              {entry.status === "failed" ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="flex-1 text-xs font-bold text-rose-700">
                    {entry.lastError ?? "This order could not be synced."}
                  </p>
                  <button
                    className="focus-ring inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1 text-xs font-black text-stone-600 hover:bg-stone-50"
                    onClick={() => onRetry(entry.clientOrderId)}
                    type="button"
                  >
                    <RefreshCw size={13} />
                    Retry
                  </button>
                  <button
                    className="focus-ring inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs font-black text-rose-600 hover:bg-rose-50"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Discard this offline order? It has NOT been saved to the system."
                        )
                      ) {
                        onDiscard(entry.clientOrderId);
                      }
                    }}
                    type="button"
                  >
                    <Trash2 size={13} />
                    Discard
                  </button>
                </div>
              ) : (
                <p className="mt-1 text-xs font-bold text-amber-700">
                  {syncing ? "Syncing…" : "Waiting for connection"}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
