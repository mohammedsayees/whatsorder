"use client";

import { useEffect, useState } from "react";
import { Files, Printer, ReceiptText } from "lucide-react";
import { recordOrderPrintEventsAction } from "@/app/actions";
import { renderOrderTickets, type PrintKind } from "@/lib/order-print";
import { printHtmlDocument } from "@/lib/print-ticket";
import type { Order, Restaurant } from "@/lib/types";

type PrintSelection = PrintKind | "both";

export function OrderPrintActions({
  order,
  restaurant
}: {
  order: Order;
  restaurant: Restaurant;
}) {
  const storagePrefix = `whatsorder-printed:${restaurant.id}:${order.id}`;
  const [printed, setPrinted] = useState<Record<PrintKind, boolean>>({
    kot: false,
    receipt: false
  });
  const [printError, setPrintError] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const kotAllowed = order.status !== "New" && order.status !== "Cancelled";
  const receiptAllowed = order.status !== "Cancelled";

  useEffect(() => {
    const initializationTimer = window.setTimeout(() => {
      try {
        setPrinted({
          kot: window.localStorage.getItem(`${storagePrefix}:kot`) === "true",
          receipt: window.localStorage.getItem(`${storagePrefix}:receipt`) === "true"
        });
      } catch {
        // Printing still works when local storage is unavailable.
      }
    }, 0);

    return () => {
      window.clearTimeout(initializationTimer);
    };
  }, [storagePrefix]);

  function markPrinted(kinds: PrintKind[]) {
    setPrinted((current) => {
      const next = { ...current };

      for (const kind of kinds) {
        next[kind] = true;

        try {
          window.localStorage.setItem(`${storagePrefix}:${kind}`, "true");
        } catch {
          // Reprint state is best-effort on this browser.
        }
      }

      return next;
    });
  }

  function print(selection: PrintSelection) {
    if (isPrinting) {
      return;
    }

    setIsPrinting(true);
    setPrintError(null);
    const kinds: PrintKind[] = selection === "both" ? ["kot", "receipt"] : [selection];

    printHtmlDocument(
      renderOrderTickets({ order, restaurant, kinds, reprint: printed }),
      setPrintError
    );

    markPrinted(kinds);
    window.setTimeout(() => setIsPrinting(false), 1_000);

    void recordOrderPrintEventsAction(
      order.id,
      kinds.map((kind) => ({ kind, isReprint: printed[kind] })),
      navigator.userAgent
    )
      .then((trackingResult) => {
        if (!trackingResult.ok) {
          setPrintError(trackingResult.error);
        }
      })
      .catch(() => {
        setPrintError("The print opened, but tracking could not be saved.");
      });
  }

  return (
    <div className="mt-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-xs font-black text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!kotAllowed || isPrinting}
          onClick={() => void print("kot")}
          title={kotAllowed ? "Print kitchen order ticket" : "Accept the order before printing the KOT"}
          type="button"
        >
          <Printer size={15} />
          {printed.kot ? "Reprint KOT" : "Print KOT"}
        </button>
        <button
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-xs font-black text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!receiptAllowed || isPrinting}
          onClick={() => void print("receipt")}
          type="button"
        >
          <ReceiptText size={15} />
          {printed.receipt ? "Reprint Receipt" : "Print Receipt"}
        </button>
      </div>
      <button
        className="focus-ring mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-stone-100 px-3 py-2 text-xs font-black text-stone-700 hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-45"
        disabled={!kotAllowed || !receiptAllowed || isPrinting}
        onClick={() => void print("both")}
        title={kotAllowed ? "Print kitchen and customer copies" : "Accept the order before printing both copies"}
        type="button"
      >
        <Files size={15} />
        Print Both
      </button>
      {!kotAllowed && order.status === "New" ? (
        <p className="mt-2 text-center text-xs font-semibold text-stone-400">
          Accept the order to print the kitchen copy.
        </p>
      ) : null}
      {printError ? (
        <p className="mt-2 text-center text-xs font-semibold text-rose-600">{printError}</p>
      ) : null}
    </div>
  );
}
