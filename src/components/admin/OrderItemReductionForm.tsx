"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Minus, Plus, Printer, Trash2 } from "lucide-react";
import { reduceItemsFromOrderAction } from "@/app/admin/orders/actions";
import { formatLineOptions } from "@/lib/cart-line";
import { formatCurrency } from "@/lib/currency";
import { renderKotCorrectionTicket } from "@/lib/order-print";
import { printHtmlDocument } from "@/lib/print-ticket";
import type { Order, Restaurant } from "@/lib/types";

type SavedCorrection = {
  order: Order;
  reason: string;
  removedItems: Order["items"];
};

export function OrderItemReductionForm({
  order,
  restaurant
}: {
  order: Order;
  restaurant: Restaurant;
}) {
  const [reductions, setReductions] = useState<Record<number, number>>({});
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [retryUnchanged, setRetryUnchanged] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [saved, setSaved] = useState<SavedCorrection | null>(null);
  const attemptIdRef = useRef<string | null>(null);

  const orderedQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const removalQuantity = Object.values(reductions).reduce((sum, quantity) => sum + quantity, 0);
  const removesEverything = removalQuantity >= orderedQuantity;
  const removedValue = order.items.reduce(
    (sum, item, index) => sum + Number(item.price) * (reductions[index] ?? 0),
    0
  );

  function changeReduction(lineIndex: number, delta: number) {
    if (pending || retryUnchanged || saved) return;

    setReductions((current) => {
      const maximum = order.items[lineIndex]?.quantity ?? 0;
      const next = Math.max(0, Math.min(maximum, (current[lineIndex] ?? 0) + delta));
      const updated = { ...current };
      if (next === 0) delete updated[lineIndex];
      else updated[lineIndex] = next;
      return updated;
    });
  }

  function printCorrection(correction: SavedCorrection) {
    printHtmlDocument(
      renderKotCorrectionTicket({
        order: correction.order,
        reason: correction.reason,
        removedItems: correction.removedItems,
        restaurant
      }),
      (error) => setMessage({ kind: "error", text: error })
    );
  }

  async function submit() {
    if (pending || saved || removalQuantity === 0 || removesEverything || !reason.trim()) return;

    setPending(true);
    setMessage(null);
    const clientOrderId = attemptIdRef.current ?? crypto.randomUUID();
    attemptIdRef.current = clientOrderId;

    try {
      const result = await reduceItemsFromOrderAction(order.id, {
        clientOrderId,
        expectedItems: order.items,
        reason,
        reductions: Object.entries(reductions).map(([lineIndex, quantity]) => ({
          lineIndex: Number(lineIndex),
          quantity
        }))
      });

      if (result.error) {
        setRetryUnchanged(Boolean(result.retryUnchanged));
        if (!result.retryUnchanged) attemptIdRef.current = null;
        setMessage({ kind: "error", text: result.error });
        return;
      }

      if (!result.order || !result.removedItems || !result.reason) {
        setRetryUnchanged(true);
        setMessage({
          kind: "error",
          text: "The change may have been saved. Retry this unchanged correction."
        });
        return;
      }

      const correction = {
        order: result.order,
        reason: result.reason,
        removedItems: result.removedItems
      };
      setSaved(correction);
      setRetryUnchanged(false);
      setMessage({ kind: "success", text: result.success ?? "Items removed." });
      printCorrection(correction);
    } catch {
      setRetryUnchanged(true);
      setMessage({
        kind: "error",
        text: "The connection failed. Retry this unchanged correction so items are not removed twice."
      });
    } finally {
      setPending(false);
    }
  }

  if (saved) {
    return (
      <section className="mx-auto max-w-2xl rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
        <div className="rounded-lg bg-emerald-50 p-4 text-emerald-900">
          <h2 className="font-black">Order corrected</h2>
          <p className="mt-1 text-sm font-semibold">
            New total: {formatCurrency(saved.order.total, restaurant)}. Give the correction ticket to the kitchen.
          </p>
        </div>
        {message?.kind === "error" ? (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700" role="alert">
            {message.text}
          </p>
        ) : null}
        <button
          className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-3 font-black text-white"
          onClick={() => printCorrection(saved)}
          type="button"
        >
          <Printer size={18} /> Reprint KOT correction
        </button>
        <Link
          className="focus-ring mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 px-4 py-3 font-black text-stone-700"
          href="/admin/orders"
        >
          <ArrowLeft size={18} /> Return to orders
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="space-y-3">
        {order.items.map((item, index) => {
          const removing = reductions[index] ?? 0;
          return (
            <article className="rounded-lg border border-stone-200 p-3" key={`${index}-${item.item_id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black">{item.quantity}× {item.name}</p>
                  {formatLineOptions(item.options) ? (
                    <p className="mt-0.5 text-xs font-semibold text-stone-500">{formatLineOptions(item.options)}</p>
                  ) : null}
                  <p className="mt-1 text-sm text-stone-500">
                    {formatCurrency(Number(item.price) * item.quantity, restaurant)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="mb-1 text-xs font-black uppercase tracking-wide text-rose-700">Remove</p>
                  <div className="flex items-center rounded-lg border border-stone-300">
                    <button
                      aria-label={`Remove fewer ${item.name}`}
                      className="focus-ring p-2 text-stone-700 disabled:opacity-30"
                      disabled={pending || retryUnchanged || removing === 0}
                      onClick={() => changeReduction(index, -1)}
                      type="button"
                    >
                      <Minus size={17} />
                    </button>
                    <span className="min-w-8 text-center font-black">{removing}</span>
                    <button
                      aria-label={`Remove another ${item.name}`}
                      className="focus-ring p-2 text-rose-700 disabled:opacity-30"
                      disabled={pending || retryUnchanged || removing >= item.quantity}
                      onClick={() => changeReduction(index, 1)}
                      type="button"
                    >
                      <Plus size={17} />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <label className="mt-5 block text-sm font-black text-stone-700">
        Reason for kitchen
        <textarea
          className="focus-ring mt-1.5 block min-h-24 w-full rounded-lg border-2 border-stone-300 px-3 py-2 font-normal"
          disabled={pending || retryUnchanged}
          maxLength={300}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Customer changed their order"
          value={reason}
        />
      </label>

      <div className="mt-4 rounded-lg bg-stone-50 p-3 text-sm">
        <div className="flex justify-between gap-3">
          <span className="font-bold text-stone-600">Removing</span>
          <span className="font-black">{removalQuantity} item{removalQuantity === 1 ? "" : "s"}</span>
        </div>
        <div className="mt-1 flex justify-between gap-3">
          <span className="font-bold text-stone-600">New total</span>
          <span className="font-black">{formatCurrency(Number(order.total) - removedValue, restaurant)}</span>
        </div>
      </div>

      {removesEverything ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
          To remove every item, return to Orders and cancel the whole order instead.
        </p>
      ) : null}
      {retryUnchanged ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
          Keep this correction unchanged and retry. The same attempt ID prevents a double removal.
        </p>
      ) : null}
      {message ? (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm font-bold ${
            message.kind === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"
          }`}
          role={message.kind === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}

      <button
        className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-rose-700 px-4 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
        disabled={
          pending || removalQuantity === 0 || removesEverything || (!retryUnchanged && !reason.trim())
        }
        onClick={() => void submit()}
        type="button"
      >
        <Trash2 size={18} />
        {pending ? "Saving…" : retryUnchanged ? "Retry unchanged correction" : "Remove items & print correction"}
      </button>
    </section>
  );
}
