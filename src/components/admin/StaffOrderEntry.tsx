"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Files, Minus, Plus, Printer, ReceiptText, Search, Trash2 } from "lucide-react";
import { recordOrderPrintEventsAction } from "@/app/actions";
import { submitStaffOrderAction } from "@/app/admin/orders/actions";
import {
  QueuedOrdersPanel,
  useStaffOrderQueue,
  withTimeout
} from "@/components/admin/StaffOrderQueue";
import {
  ItemOptionsSheet,
  resolveOptionGroupsByItem
} from "@/components/customer/ItemOptionsSheet";
import { cartLineKey, configuredUnitPrice, formatLineOptions } from "@/lib/cart-line";
import { formatAED } from "@/lib/currency";
import { renderOrderTickets, type PrintKind } from "@/lib/order-print";
import { printHtmlDocument } from "@/lib/print-ticket";
import {
  isStaffOrderActionKind,
  type StaffOrderPayload
} from "@/lib/staff-order-payload";
import type {
  CartLine,
  CartLineOption,
  FulfilmentType,
  MenuItem,
  MenuOptionCatalog,
  MenuWithCategories,
  Order,
  Restaurant
} from "@/lib/types";

// Ticket lines are keyed by cartLineKey (item + selected options) so the same
// item can sit on the ticket twice with different configurations — matching
// the customer cart and the server's verification model.
type TicketLine = {
  itemId: string;
  name: string;
  nameAr: string | null;
  price: number;
  quantity: number;
  options?: CartLineOption[];
};

const fulfilmentLabels: Record<FulfilmentType, string> = {
  delivery: "Delivery",
  takeaway: "Takeaway",
  car_pickup: "Bring to My Car",
  dine_in: "Dine-in"
};

// How the punch submit resolved, shown in the ticket footer. "queued" means
// the internet was down or too slow, so the order is safely stored on the
// device and will sync automatically — staff can keep punching. On success the
// saved order rides along so its KOT/receipt can be printed on the spot.
type SubmitFeedback =
  | { kind: "success"; message: string; order?: Order }
  | { kind: "queued"; message: string }
  | { kind: "error"; message: string };

// Live punch waits only briefly before falling back to the offline queue, so
// staff are never left staring at a spinner on a dead connection.
const LIVE_SUBMIT_TIMEOUT_MS = 8_000;

export function StaffOrderEntry({
  deliveryFee,
  menu,
  optionCatalog,
  orderTypes,
  restaurant
}: {
  deliveryFee: number;
  menu: MenuWithCategories;
  optionCatalog?: MenuOptionCatalog;
  orderTypes: FulfilmentType[];
  restaurant: Restaurant;
}) {
  const restaurantId = restaurant.id;
  const [lines, setLines] = useState<Record<string, TicketLine>>({});
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | "all">("all");
  const [fulfilmentType, setFulfilmentType] = useState<FulfilmentType>(orderTypes[0]);
  const [pickerItem, setPickerItem] = useState<MenuItem | null>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<SubmitFeedback | null>(null);

  const { queue, syncingId, enqueue, retry, discard } = useStaffOrderQueue(restaurantId);

  const resolvedGroupsByItemId = useMemo(
    () => resolveOptionGroupsByItem(optionCatalog),
    [optionCatalog]
  );

  function clearTicket() {
    setLines({});
    setSearch("");
    setSelectedCategoryId("all");
  }

  const availableItems = useMemo(
    () => menu.items.filter((item) => item.is_available),
    [menu.items]
  );

  const orderedCategories = useMemo(
    () =>
      [...menu.categories]
        .filter((category) => category.is_active)
        .sort((first, second) => first.display_order - second.display_order),
    [menu.categories]
  );

  const normalizedSearch = search.trim().toLowerCase();
  const matchingItems = normalizedSearch
    ? availableItems.filter((item) =>
        `${item.name} ${item.name_ar ?? ""}`.toLowerCase().includes(normalizedSearch)
      )
    : null;

  // Categories that actually have available items, for the quick-pick chips.
  const categoriesWithItems = orderedCategories.filter((category) =>
    availableItems.some((item) => item.category_id === category.id)
  );
  const visibleCategories =
    selectedCategoryId === "all"
      ? orderedCategories
      : orderedCategories.filter((category) => category.id === selectedCategoryId);

  const ticketLines = Object.values(lines);
  const subtotal = ticketLines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const itemCount = ticketLines.reduce((sum, line) => sum + line.quantity, 0);
  const appliedDeliveryFee = fulfilmentType === "delivery" ? deliveryFee : 0;
  const total = subtotal + appliedDeliveryFee;

  // Tap-to-add: option-ful items open the picker, plain items add instantly.
  function handleAdd(itemId: string) {
    const item = availableItems.find((entry) => entry.id === itemId);

    if (!item) {
      return;
    }

    if ((resolvedGroupsByItemId.get(item.id) ?? []).length > 0) {
      setPickerItem(item);
      return;
    }

    addTicketLine(item, [], 1);
  }

  function addTicketLine(item: MenuItem, options: CartLineOption[], quantity: number) {
    const key = cartLineKey({ item_id: item.id, options });

    setLines((current) => {
      const existing = current[key];
      return {
        ...current,
        [key]: {
          itemId: item.id,
          name: item.name,
          nameAr: item.name_ar ?? null,
          price: configuredUnitPrice(item.price, options),
          quantity: (existing?.quantity ?? 0) + quantity,
          ...(options.length > 0 ? { options } : {})
        }
      };
    });
  }

  function changeQuantity(lineKey: string, delta: number) {
    setLines((current) => {
      const existing = current[lineKey];
      if (!existing) {
        return current;
      }
      const nextQuantity = existing.quantity + delta;
      if (nextQuantity < 1) {
        const { [lineKey]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [lineKey]: { ...existing, quantity: nextQuantity } };
    });
  }

  function removeItem(lineKey: string) {
    setLines((current) => {
      const { [lineKey]: _removed, ...rest } = current;
      return rest;
    });
  }

  const cartPayload: CartLine[] = ticketLines.map((line) => ({
    item_id: line.itemId,
    name: line.name,
    name_ar: line.nameAr,
    price: line.price,
    quantity: line.quantity,
    ...(line.options && line.options.length > 0 ? { options: line.options } : {})
  }));

  // Build the payload, try to send it live within a short timeout, and fall
  // back to the device outbox on any network/timeout failure. Either way the
  // ticket clears so staff can immediately punch the next order — a slow or
  // dead connection never blocks the counter.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (ticketLines.length === 0 || pending) {
      return;
    }

    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as
      | HTMLButtonElement
      | null;
    const action = submitter?.value ?? "kitchen";

    if (!isStaffOrderActionKind(action)) {
      return;
    }

    const formData = new FormData(form);
    const readField = (key: string) => String(formData.get(key) ?? "").trim();

    const payload: StaffOrderPayload = {
      clientOrderId: crypto.randomUUID(),
      restaurantId,
      punchedAt: new Date().toISOString(),
      action,
      fulfilmentType,
      items: cartPayload,
      tableNumber: readField("table_number"),
      deliveryArea: readField("delivery_area"),
      deliveryAddress: readField("delivery_address"),
      deliveryLandmark: readField("delivery_landmark"),
      carPlateNumber: readField("car_plate_number"),
      carDescription: readField("car_description"),
      customerName: readField("customer_name"),
      customerPhone: readField("customer_phone"),
      notes: readField("notes")
    };

    setPending(true);
    setFeedback(null);

    const queueOffline = async () => {
      try {
        await enqueue(payload, total);
        clearTicket();
        setFeedback({
          kind: "queued",
          message: "No connection — order saved on this device. It will sync automatically."
        });
      } catch {
        setFeedback({
          kind: "error",
          message: "Offline saving isn't available on this device. Check your connection and try again."
        });
      }
    };

    try {
      // Offline devices skip the doomed round-trip and queue immediately.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await queueOffline();
        return;
      }

      const result = await withTimeout(
        submitStaffOrderAction(payload),
        LIVE_SUBMIT_TIMEOUT_MS
      );

      if (result.error) {
        // A real server rejection (e.g. item unavailable) — surface it and
        // keep the ticket so staff can fix it. Not a connectivity problem.
        setFeedback({ kind: "error", message: result.error });
      } else {
        clearTicket();
        setFeedback({
          kind: "success",
          message: result.success ?? "Order saved.",
          order: result.order
        });
      }
    } catch {
      // Timed out or the request threw (offline / slow) — queue it.
      await queueOffline();
    } finally {
      setPending(false);
    }
  }

  // Prints the just-saved order's KOT and/or receipt from the punch screen, so
  // staff never have to navigate back to the orders list. Reprints are tracked
  // the same way the orders list does.
  function printSavedOrder(order: Order, kinds: PrintKind[]) {
    printHtmlDocument(
      renderOrderTickets({
        order,
        restaurant,
        kinds,
        reprint: { kot: false, receipt: false }
      })
    );

    void recordOrderPrintEventsAction(
      order.id,
      kinds.map((kind) => ({ kind, isReprint: false })),
      navigator.userAgent
    );
  }

  return (
    <div className="space-y-6">
      {/* Offline queue — orders punched while disconnected, waiting to sync. */}
      <QueuedOrdersPanel
        onDiscard={discard}
        onRetry={retry}
        queue={queue}
        restaurant={restaurant}
        syncingId={syncingId}
      />

      <div className="grid gap-6 pb-24 lg:grid-cols-[1.4fr_1fr] lg:items-start lg:pb-0">
      {/* Menu picker */}
      <section className="flex flex-col rounded-lg border border-stone-200 bg-white p-4 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            size={18}
          />
          <input
            className="focus-ring w-full rounded-lg border border-stone-200 py-3 pl-10 pr-3"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search the menu…"
            type="search"
            value={search}
          />
        </label>

        {/* Quick category picker — hidden while searching (search spans all). */}
        {!matchingItems && categoriesWithItems.length > 1 ? (
          <div
            aria-label="Menu categories"
            className="mt-3 flex shrink-0 flex-wrap gap-2"
          >
            <button
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-black ${
                selectedCategoryId === "all"
                  ? "bg-ink text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
              onClick={() => setSelectedCategoryId("all")}
              type="button"
            >
              All
            </button>
            {categoriesWithItems.map((category) => (
              <button
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-black ${
                  selectedCategoryId === category.id
                    ? "bg-ink text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
                key={category.id}
                onClick={() => setSelectedCategoryId(category.id)}
                type="button"
              >
                {category.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-4 space-y-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          {matchingItems ? (
            <ItemGrid
              items={matchingItems.map((item) => ({
                id: item.id,
                name: item.name,
                hasOptions: (resolvedGroupsByItemId.get(item.id) ?? []).length > 0,
                price: item.price
              }))}
              onAdd={handleAdd}
            />
          ) : (
            visibleCategories.map((category) => {
              const categoryItems = availableItems.filter(
                (item) => item.category_id === category.id
              );
              if (categoryItems.length === 0) {
                return null;
              }
              return (
                <div key={category.id}>
                  <h2 className="mb-2 text-sm font-black uppercase tracking-wide text-stone-500">
                    {category.name}
                  </h2>
                  <ItemGrid
                    items={categoryItems.map((item) => ({
                      id: item.id,
                      name: item.name,
                      hasOptions: (resolvedGroupsByItemId.get(item.id) ?? []).length > 0,
                      price: item.price
                    }))}
                    onAdd={handleAdd}
                  />
                </div>
              );
            })
          )}
          {matchingItems && matchingItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-500">
              No available items match “{search}”.
            </p>
          ) : null}
        </div>
      </section>

      {/* Ticket */}
      <section className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)]">
        <form
          className="flex flex-col rounded-lg border border-stone-200 bg-white p-4 shadow-sm lg:max-h-[calc(100vh-2rem)]"
          onSubmit={handleSubmit}
        >
          <h2 className="shrink-0 text-lg font-black">Ticket</h2>

          {/* Scrollable order body — totals and actions stay pinned below */}
          <div className="mt-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div className="space-y-2">
            {ticketLines.length === 0 ? (
              <p className="rounded-lg border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">
                Tap menu items to build the order.
              </p>
            ) : (
              ticketLines.map((line) => {
                const lineKey = cartLineKey({
                  item_id: line.itemId,
                  options: line.options
                });
                const optionsText = formatLineOptions(line.options);

                return (
                  <div
                    className="flex items-center gap-2 rounded-lg border border-stone-100 px-3 py-2"
                    key={lineKey}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{line.name}</p>
                      {optionsText ? (
                        <p className="truncate text-xs text-stone-500">{optionsText}</p>
                      ) : null}
                      <p className="text-xs text-stone-500">{formatAED(line.price)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        aria-label={`Reduce ${line.name}`}
                        className="focus-ring grid h-8 w-8 place-items-center rounded-lg border border-stone-200 hover:bg-stone-50"
                        onClick={() => changeQuantity(lineKey, -1)}
                        type="button"
                      >
                        <Minus size={15} />
                      </button>
                      <span className="w-6 text-center text-sm font-black">{line.quantity}</span>
                      <button
                        aria-label={`Add ${line.name}`}
                        className="focus-ring grid h-8 w-8 place-items-center rounded-lg border border-stone-200 hover:bg-stone-50"
                        onClick={() => changeQuantity(lineKey, 1)}
                        type="button"
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                    <span className="w-16 text-right text-sm font-black">
                      {formatAED(line.price * line.quantity)}
                    </span>
                    <button
                      aria-label={`Remove ${line.name}`}
                      className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                      onClick={() => removeItem(lineKey)}
                      type="button"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Order type — only the channels this restaurant offers */}
          <fieldset className="mt-4">
            <legend className="text-xs font-black uppercase tracking-wide text-stone-500">
              Order type
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {orderTypes.map((type) => (
                <button
                  className={`focus-ring rounded-lg border px-3 py-2 text-sm font-black ${
                    fulfilmentType === type
                      ? "border-leaf bg-mint text-leaf"
                      : "border-stone-200 text-stone-600 hover:bg-stone-50"
                  }`}
                  key={type}
                  onClick={() => setFulfilmentType(type)}
                  type="button"
                >
                  {fulfilmentLabels[type]}
                </button>
              ))}
            </div>
          </fieldset>

          {fulfilmentType === "delivery" ? (
            <div className="mt-3 space-y-3">
              <label className="block text-sm font-bold text-stone-700">
                Delivery area
                <input
                  className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                  maxLength={120}
                  name="delivery_area"
                  required
                  type="text"
                />
              </label>
              <label className="block text-sm font-bold text-stone-700">
                Delivery address
                <input
                  className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                  maxLength={500}
                  name="delivery_address"
                  required
                  type="text"
                />
              </label>
              <label className="block text-sm font-bold text-stone-700">
                Landmark <span className="font-normal text-stone-400">(optional)</span>
                <input
                  className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                  maxLength={250}
                  name="delivery_landmark"
                  type="text"
                />
              </label>
            </div>
          ) : null}

          {fulfilmentType === "car_pickup" ? (
            <div className="mt-3 space-y-3">
              <label className="block text-sm font-bold text-stone-700">
                Car plate number
                <input
                  className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                  maxLength={40}
                  name="car_plate_number"
                  required
                  type="text"
                />
              </label>
              <label className="block text-sm font-bold text-stone-700">
                Car colour / model{" "}
                <span className="font-normal text-stone-400">(optional)</span>
                <input
                  className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                  maxLength={120}
                  name="car_description"
                  type="text"
                />
              </label>
            </div>
          ) : null}

          {fulfilmentType === "dine_in" ? (
            <label className="mt-3 block text-sm font-bold text-stone-700">
              Table number
              <input
                className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                maxLength={40}
                name="table_number"
                required
                type="text"
              />
            </label>
          ) : null}

          {/* Optional customer + notes */}
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-bold text-stone-700">
              Customer name <span className="font-normal text-stone-400">(optional)</span>
              <input
                className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                maxLength={120}
                name="customer_name"
                placeholder="Walk-in customer"
                type="text"
              />
            </label>
            <label className="block text-sm font-bold text-stone-700">
              Phone <span className="font-normal text-stone-400">(optional)</span>
              <input
                className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                inputMode="tel"
                maxLength={24}
                name="customer_phone"
                type="tel"
              />
            </label>
            <label className="block text-sm font-bold text-stone-700">
              Notes <span className="font-normal text-stone-400">(optional)</span>
              <input
                className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                maxLength={1000}
                name="notes"
                type="text"
              />
            </label>
          </div>

          {/* Close scrollable order body */}
          </div>

          {/* Pinned footer: totals + actions stay visible without scrolling */}
          <div className="mt-3 shrink-0 space-y-3 border-t border-stone-100 pt-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm text-stone-600">
                <span className="font-bold">
                  {itemCount} item{itemCount === 1 ? "" : "s"}
                </span>
                <span>{formatAED(subtotal)}</span>
              </div>
              {appliedDeliveryFee > 0 ? (
                <div className="flex items-center justify-between text-sm text-stone-600">
                  <span className="font-bold">Delivery fee</span>
                  <span>{formatAED(appliedDeliveryFee)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-stone-600">Total</span>
                <span className="text-lg font-black">{formatAED(total)}</span>
              </div>
            </div>

            {feedback ? (
              <p
                className={`rounded-lg px-3 py-2 text-sm font-bold ${
                  feedback.kind === "error"
                    ? "bg-rose-50 text-rose-700"
                    : feedback.kind === "queued"
                      ? "bg-amber-50 text-amber-800"
                      : "bg-emerald-50 text-emerald-800"
                }`}
                role="status"
              >
                {feedback.message}
              </p>
            ) : null}

            {/* Print the order that was just saved, without leaving the screen. */}
            {feedback?.kind === "success" && feedback.order ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2">
                <p className="mb-2 text-center text-xs font-black uppercase tracking-wide text-emerald-700">
                  Print for order #{feedback.order.id.slice(-8).toUpperCase()}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-black text-stone-700 hover:bg-stone-50"
                    onClick={() => printSavedOrder(feedback.order!, ["kot"])}
                    type="button"
                  >
                    <Printer size={15} />
                    Print KOT
                  </button>
                  <button
                    className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-black text-stone-700 hover:bg-stone-50"
                    onClick={() => printSavedOrder(feedback.order!, ["receipt"])}
                    type="button"
                  >
                    <ReceiptText size={15} />
                    Print Bill
                  </button>
                </div>
                <button
                  className="focus-ring mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-stone-100 px-3 py-2 text-xs font-black text-stone-700 hover:bg-stone-200"
                  onClick={() => printSavedOrder(feedback.order!, ["kot", "receipt"])}
                  type="button"
                >
                  <Files size={15} />
                  Print Both
                </button>
              </div>
            ) : null}

            {/* Primary flow: payment is collected later, at completion. */}
            <button
              className="focus-ring w-full rounded-lg bg-leaf px-4 py-3 font-black text-white disabled:opacity-60"
              disabled={pending || ticketLines.length === 0}
              name="action"
              type="submit"
              value="kitchen"
            >
              {pending ? "Saving…" : "Send to kitchen"}
            </button>

            {/* Optional shortcut: customer pays up front. */}
            <div className="grid grid-cols-2 gap-2">
              <button
                className="focus-ring rounded-lg border border-leaf px-3 py-2 text-sm font-black text-leaf disabled:opacity-60"
                disabled={pending || ticketLines.length === 0}
                name="action"
                type="submit"
                value="paid_cash"
              >
                Paid · Cash
              </button>
              <button
                className="focus-ring rounded-lg border border-leaf px-3 py-2 text-sm font-black text-leaf disabled:opacity-60"
                disabled={pending || ticketLines.length === 0}
                name="action"
                type="submit"
                value="paid_card"
              >
                Paid · Card
              </button>
            </div>
          </div>

          {/* Mobile: keep billing one tap away without scrolling to the ticket */}
          {ticketLines.length > 0 ? (
            <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-stone-200 bg-white p-3 shadow-lg lg:hidden">
              <div className="flex-1">
                <p className="text-xs font-bold text-stone-500">
                  {itemCount} item{itemCount === 1 ? "" : "s"}
                </p>
                <p className="text-lg font-black">{formatAED(total)}</p>
              </div>
              <button
                className="focus-ring rounded-lg bg-leaf px-5 py-3 font-black text-white disabled:opacity-60"
                disabled={pending}
                name="action"
                type="submit"
                value="kitchen"
              >
                {pending ? "Saving…" : "Send to kitchen"}
              </button>
            </div>
          ) : null}
        </form>
      </section>
      </div>

      {pickerItem ? (
        <ItemOptionsSheet
          basePrice={pickerItem.price}
          groups={resolvedGroupsByItemId.get(pickerItem.id) ?? []}
          item={pickerItem}
          language="en"
          onAdd={(options, quantity) => {
            addTicketLine(pickerItem, options, quantity);
            setPickerItem(null);
          }}
          onClose={() => setPickerItem(null)}
        />
      ) : null}
    </div>
  );
}

function ItemGrid({
  items,
  onAdd
}: {
  items: { id: string; name: string; hasOptions: boolean; price: number }[];
  onAdd: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((item) => (
        <button
          className="focus-ring flex h-full flex-col justify-between gap-2 rounded-lg border border-stone-200 p-3 text-left hover:border-leaf hover:bg-mint"
          key={item.id}
          onClick={() => onAdd(item.id)}
          type="button"
        >
          <span className="text-sm font-bold leading-tight">{item.name}</span>
          <span className="flex items-center gap-2 text-sm font-black text-leaf">
            {formatAED(item.price)}
            {item.hasOptions ? (
              <span className="rounded-full bg-mint/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-leaf">
                Options
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}
