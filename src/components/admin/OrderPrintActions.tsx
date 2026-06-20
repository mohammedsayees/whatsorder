"use client";

import { useEffect, useState } from "react";
import { Files, Printer, ReceiptText } from "lucide-react";
import type { Order, Restaurant } from "@/lib/types";

type PrintKind = "kot" | "receipt";
type PrintSelection = PrintKind | "both";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value: number) {
  return `AED ${Number(value).toFixed(2)}`;
}

function formatOrderDate(value: string) {
  return new Intl.DateTimeFormat("en-AE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dubai"
  }).format(new Date(value));
}

function orderReference(orderId: string) {
  return orderId.slice(-8).toUpperCase();
}

function fulfilmentLabel(order: Order) {
  if (order.fulfilment_type === "car_pickup") {
    return "Bring to My Car";
  }

  if (order.fulfilment_type === "dine_in") {
    return "Dine In";
  }

  if (order.fulfilment_type === "takeaway") {
    return "Takeaway";
  }

  return "Delivery";
}

function fulfilmentDetails(order: Order, includeDeliveryAddress: boolean) {
  if (order.fulfilment_type === "car_pickup") {
    return `
      <div class="important">Plate: ${escapeHtml(order.car_plate_number || "Not provided")}</div>
      ${order.car_description ? `<div>Car: ${escapeHtml(order.car_description)}</div>` : ""}
    `;
  }

  if (order.fulfilment_type === "dine_in") {
    return `<div class="important">Table: ${escapeHtml(order.table_number || "Not provided")}</div>`;
  }

  if (order.fulfilment_type === "delivery" && includeDeliveryAddress) {
    return `
      ${order.delivery_area ? `<div>Area: ${escapeHtml(order.delivery_area)}</div>` : ""}
      ${order.delivery_address ? `<div>Address: ${escapeHtml(order.delivery_address)}</div>` : ""}
      ${order.delivery_landmark ? `<div>Landmark: ${escapeHtml(order.delivery_landmark)}</div>` : ""}
    `;
  }

  return "";
}

function ticketHeader(
  restaurant: Restaurant,
  order: Order,
  title: string,
  reprint: boolean
) {
  return `
    <header>
      <h1>${escapeHtml(restaurant.name)}</h1>
      <div class="ticket-title">${escapeHtml(title)}</div>
      ${reprint ? '<div class="reprint">*** REPRINT ***</div>' : ""}
      <div>Order #${escapeHtml(orderReference(order.id))}</div>
      <div>${escapeHtml(formatOrderDate(order.created_at))}</div>
      <div class="status">${escapeHtml(order.status)} · ${escapeHtml(fulfilmentLabel(order))}</div>
    </header>
  `;
}

function itemsTable(order: Order, includePrices: boolean) {
  const rows = order.items
    .map(
      (item) => `
        <tr>
          <td class="quantity">${escapeHtml(item.quantity)}×</td>
          <td>${escapeHtml(item.name)}</td>
          ${
            includePrices
              ? `<td class="money">${escapeHtml(formatMoney(item.price * item.quantity))}</td>`
              : ""
          }
        </tr>
      `
    )
    .join("");

  return `
    <table>
      <thead>
        <tr>
          <th>Qty</th>
          <th>Item</th>
          ${includePrices ? '<th class="money">Amount</th>' : ""}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function kotTicket(restaurant: Restaurant, order: Order, reprint: boolean) {
  return `
    <section class="ticket">
      ${ticketHeader(restaurant, order, "KOT / KITCHEN COPY", reprint)}
      <div class="section">
        ${fulfilmentDetails(order, false)}
        ${order.customer_name ? `<div>Customer: ${escapeHtml(order.customer_name)}</div>` : ""}
      </div>
      ${itemsTable(order, false)}
      ${
        order.notes
          ? `<div class="notes"><strong>ORDER NOTES</strong><br>${escapeHtml(order.notes)}</div>`
          : ""
      }
      <footer>Kitchen copy · Prices intentionally hidden</footer>
    </section>
  `;
}

function receiptTicket(restaurant: Restaurant, order: Order, reprint: boolean) {
  return `
    <section class="ticket">
      ${ticketHeader(restaurant, order, "ORDER RECEIPT", reprint)}
      <div class="section">
        ${restaurant.address ? `<div>${escapeHtml(restaurant.address)}</div>` : ""}
        <div>WhatsApp: ${escapeHtml(restaurant.whatsapp_number)}</div>
      </div>
      <div class="section">
        <div>Customer: ${escapeHtml(order.customer_name)}</div>
        <div>Phone: ${escapeHtml(order.customer_phone)}</div>
        ${fulfilmentDetails(order, true)}
      </div>
      ${itemsTable(order, true)}
      <div class="totals">
        <div><span>Subtotal</span><span>${escapeHtml(formatMoney(order.subtotal))}</span></div>
        ${
          Number(order.delivery_fee) > 0
            ? `<div><span>Delivery fee</span><span>${escapeHtml(formatMoney(order.delivery_fee))}</span></div>`
            : ""
        }
        ${
          Number(order.loyalty_discount) > 0
            ? `<div><span>Loyalty discount</span><span>-${escapeHtml(formatMoney(order.loyalty_discount))}</span></div>`
            : ""
        }
        <div class="grand-total"><span>Total</span><span>${escapeHtml(formatMoney(order.total))}</span></div>
      </div>
      <div class="section">
        <div>Payment: ${escapeHtml(order.payment_method)}</div>
        ${order.notes ? `<div>Notes: ${escapeHtml(order.notes)}</div>` : ""}
      </div>
      <footer>Thank you for your order.<br>This is an order receipt, not a tax invoice.</footer>
    </section>
  `;
}

function printableDocument(content: string, title: string) {
  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: 80mm auto; margin: 4mm; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: #fff; color: #000; }
          body { width: 72mm; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.35; }
          .ticket { width: 100%; }
          .ticket + .ticket { break-before: page; page-break-before: always; }
          header { border-bottom: 2px dashed #000; padding-bottom: 8px; text-align: center; }
          h1 { margin: 0 0 3px; font-size: 20px; }
          .ticket-title { margin: 4px 0; font-size: 16px; font-weight: 900; }
          .reprint { margin: 5px 0; border: 2px solid #000; padding: 3px; font-size: 15px; font-weight: 900; }
          .status { margin-top: 4px; font-weight: 800; }
          .section { border-bottom: 1px dashed #000; padding: 7px 0; }
          .important { font-size: 16px; font-weight: 900; }
          table { width: 100%; border-collapse: collapse; margin: 7px 0; }
          th { border-bottom: 1px solid #000; padding: 4px 2px; text-align: left; }
          td { border-bottom: 1px dotted #777; padding: 7px 2px; vertical-align: top; font-size: 13px; font-weight: 700; }
          .quantity { width: 12mm; font-size: 16px; font-weight: 900; }
          .money { text-align: right; white-space: nowrap; }
          .notes { margin: 8px 0; border: 2px solid #000; padding: 7px; font-size: 14px; }
          .totals { border-top: 1px dashed #000; padding: 7px 0; }
          .totals > div { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
          .grand-total { border-top: 2px solid #000; margin-top: 6px !important; padding-top: 6px; font-size: 16px; font-weight: 900; }
          footer { border-top: 2px dashed #000; margin-top: 8px; padding-top: 8px; text-align: center; font-size: 10px; }
          @media screen {
            body { margin: 16px auto; box-shadow: 0 0 20px rgba(0,0,0,.15); padding: 4mm; min-height: 100vh; }
          }
        </style>
      </head>
      <body>${content}</body>
    </html>`;
}

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
    setPrintError(null);
    const kinds: PrintKind[] = selection === "both" ? ["kot", "receipt"] : [selection];
    const content = kinds
      .map((kind) =>
        kind === "kot"
          ? kotTicket(restaurant, order, printed.kot)
          : receiptTicket(restaurant, order, printed.receipt)
      )
      .join("");
    const printWindow = window.open("", "_blank", "width=440,height=760");

    if (!printWindow) {
      setPrintError("Allow pop-ups for WhatsOrder to print this order.");
      return;
    }

    printWindow.opener = null;
    printWindow.document.open();
    printWindow.document.write(
      printableDocument(content, `${restaurant.name} order ${orderReference(order.id)}`)
    );
    printWindow.document.close();
    printWindow.focus();
    markPrinted(kinds);

    window.setTimeout(() => {
      printWindow.print();
    }, 250);
  }

  return (
    <div className="mt-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-xs font-black text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!kotAllowed}
          onClick={() => print("kot")}
          title={kotAllowed ? "Print kitchen order ticket" : "Accept the order before printing the KOT"}
          type="button"
        >
          <Printer size={15} />
          {printed.kot ? "Reprint KOT" : "Print KOT"}
        </button>
        <button
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-xs font-black text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!receiptAllowed}
          onClick={() => print("receipt")}
          type="button"
        >
          <ReceiptText size={15} />
          {printed.receipt ? "Reprint Receipt" : "Print Receipt"}
        </button>
      </div>
      <button
        className="focus-ring mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-stone-100 px-3 py-2 text-xs font-black text-stone-700 hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-45"
        disabled={!kotAllowed || !receiptAllowed}
        onClick={() => print("both")}
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
