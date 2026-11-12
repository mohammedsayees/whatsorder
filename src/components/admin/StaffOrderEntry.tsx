"use client";

import { QuickProduct } from "./QuickProduct";
import { StaffCreditCustomerSelector } from "./StaffCreditCustomerSelector";
import { useStaffDraft } from "./useStaffDraft";
import { ItemGrid } from "./StaffItemGrid";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { Banknote, BookUser, ChefHat, ChevronDown, CreditCard, Files, Minus, Plus, Printer, ReceiptText, Search, Trash2 } from "lucide-react";
import { recordOrderPrintEventsAction } from "@/app/actions";
import {
  addItemsToOrderAction,
  submitStaffOrderAction
} from "@/app/admin/orders/actions";
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
import { formatCurrency } from "@/lib/currency";
import { verifyCartAgainstMenu } from "@/lib/order-pricing";
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
  Restaurant,
  StaffCreditCustomerOption
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
  staffUserId = "fixture",
  addToOrder,
  canManageCredit = false,
  creditCustomers = [],
  deliveryFee,
  menu,
  optionCatalog,
  orderTypes,
  restaurant
}: {
  staffUserId?: string;
  addToOrder?: Order;
  canManageCredit?: boolean;
  creditCustomers?: StaffCreditCustomerOption[];
  deliveryFee: number;
  menu: MenuWithCategories;
  optionCatalog?: MenuOptionCatalog;
  orderTypes: FulfilmentType[];
  restaurant: Restaurant;
}) {
  const restaurantId = restaurant.id;
  const isAddingToOrder = Boolean(addToOrder);
  const draftStore = useStaffDraft(`${restaurantId}:${staffUserId}:${addToOrder?.id ?? "new"}`, addToOrder?.fulfilment_type ?? orderTypes[0]);
  const draft = draftStore.draft;
  const lines = draft?.lines ?? {};
  const setLines = (update: (current: Record<string, TicketLine>) => Record<string, TicketLine>) => { void draftStore.patch({ lines: update(lines) }).catch(() => {}); };
  const [extraItems, setExtraItems] = useState<MenuItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | "all">("all");
  const fulfilmentType = draft?.fulfilmentType ?? addToOrder?.fulfilment_type ?? orderTypes[0];
  const selectedCreditCustomerId = draft?.fields.credit_customer_id ?? "";
  const selectedCreditCustomer = creditCustomers.find((customer) => customer.id === selectedCreditCustomerId);
  const setFulfilmentType = (type: FulfilmentType) => { void draftStore.patch({ fulfilmentType: type }).catch(() => {}); };
  const [pickerItem, setPickerItem] = useState<MenuItem | null>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<SubmitFeedback | null>(null);
  const [printCustomerBill, setPrintCustomerBill] = useState(false);
  const [showPaymentPanel, setShowPaymentPanel] = useState(false);
  const additionAttemptIdRef = useRef<string | null>(null);

  const { queue, syncingId, enqueue, retry, discard } = useStaffOrderQueue(restaurantId);

  const resolvedGroupsByItemId = useMemo(
    () => resolveOptionGroupsByItem(optionCatalog),
    [optionCatalog]
  );

  async function runDraftOperation(operation: () => Promise<void>) {
    setPending(true);
    try { await operation(); setFeedback(null); setShowPaymentPanel(false); setPrintCustomerBill(false); }
    catch { setFeedback({ kind: "error", message: "Could not update the draft. Keep this page open and retry." }); }
    finally { setPending(false); }
  }

  async function clearTicket() {
    await draftStore.finish();
    additionAttemptIdRef.current = null;
    setPrintCustomerBill(false);
    setShowPaymentPanel(false);
    setSearch("");
    setSelectedCategoryId("all");
  }

  const availableItems = useMemo(
    () => [...menu.items, ...extraItems.filter(item => !menu.items.some(existing => existing.id === item.id))].filter((item) => item.is_available),
    [menu.items, extraItems]
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
    if (draft?.attempt || additionAttemptIdRef.current) {
      setFeedback({
        kind: "error",
        message: "Retry the unchanged add-on ticket first; its previous result is still being checked."
      });
      return;
    }

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
    if (draft?.attempt || additionAttemptIdRef.current) {
      setPickerItem(null);
      setFeedback({
        kind: "error",
        message: "Retry the unchanged add-on ticket first; its previous result is still being checked."
      });
      return;
    }

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
    if (draft?.attempt || additionAttemptIdRef.current) {
      setFeedback({
        kind: "error",
        message: "Retry the unchanged add-on ticket first; its previous result is still being checked."
      });
      return;
    }

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
    if (draft?.attempt || additionAttemptIdRef.current) {
      setFeedback({
        kind: "error",
        message: "Retry the unchanged add-on ticket first; its previous result is still being checked."
      });
      return;
    }

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
  const menuReview = verifyCartAgainstMenu(cartPayload, { ...menu, items: [...menu.items, ...extraItems] }, [], optionCatalog);
  const pricesChanged = menuReview.ok && menuReview.items.some((item, index) => item.price !== cartPayload[index]?.price);
  const needsReview = !draft?.attempt && ticketLines.length > 0 && (!menuReview.ok || pricesChanged);

  // Build the payload, try to send it live within a short timeout, and fall
  // back to the device outbox on any network/timeout failure. Either way the
  // ticket clears so staff can immediately punch the next order — a slow or
  // dead connection never blocks the counter.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (ticketLines.length === 0 || pending || !draft || draftStore.error || needsReview) {
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
    const readField = (key: string) => String(draft.fields[key] ?? formData.get(key) ?? "").trim();

    if (addToOrder) {
      setPending(true);
      setFeedback(null);

      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setFeedback({
            kind: "error",
            message: "Reconnect before adding items. Nothing has been changed."
          });
          return;
        }

        const clientOrderId = draft.attempt?.id ?? additionAttemptIdRef.current ?? crypto.randomUUID();
        await draftStore.patch({ attempt: { id: clientOrderId } });
        additionAttemptIdRef.current = clientOrderId;

        const result = await withTimeout(
          addItemsToOrderAction(addToOrder.id, {
            clientOrderId,
            items: cartPayload,
            note: readField("notes")
          }),
          LIVE_SUBMIT_TIMEOUT_MS
        );

        if (result.error) {
          // A definite server rejection did not mutate the order; allow staff
          // to correct the ticket and submit it as a new attempt.
          additionAttemptIdRef.current = null;
          if (!result.retryUnchanged) await draftStore.patch({ attempt: undefined });
          setFeedback({ kind: "error", message: result.error });
          return;
        }

        await clearTicket();
        setFeedback({
          kind: "success",
          message: result.success ?? "Items added.",
          order: result.order
        });

        if (result.order) {
          printSavedOrder(result.order, ["kot"]);
        }
      } catch {
        setFeedback({
          kind: "error",
          message: "The connection timed out. Retry this unchanged ticket when online; it cannot be added twice."
        });
      } finally {
        setPending(false);
      }
      return;
    }

    const payload: StaffOrderPayload = draft.attempt?.payload ?? {
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
      customerId: readField("credit_customer_id"),
      notes: readField("notes")
    };

    setPending(true);
    setFeedback(null);

    const queueOffline = async () => {
      try {
        await enqueue(payload, total);
        await clearTicket();
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

    let prepared = false;
    try {
      await draftStore.patch({ attempt: { id: payload.clientOrderId, payload } });
      prepared = true;
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
        if (!result.retryUnchanged) await draftStore.patch({ attempt: undefined });
        setFeedback({ kind: "error", message: result.error });
      } else {
        await clearTicket();
        setFeedback({
          kind: "success",
          message: result.success ?? "Order saved.",
          order: result.order
        });
        // Fire the kitchen copy automatically the moment a ticket is sent to
        // the kitchen — staff shouldn't need a second tap. The Print buttons
        // stay for reprints and the customer bill. (Paid-now sales don't
        // auto-print; the counter decides whether a bill is needed.)
        if (action === "kitchen" && result.order) {
          printSavedOrder(
            result.order,
            printCustomerBill ? ["receipt", "kot"] : ["kot"]
          );
        } else if (action !== "kitchen" && result.order && printCustomerBill) {
          printSavedOrder(result.order, ["receipt"]);
        }
      }
    } catch {
      // Timed out or the request threw (offline / slow) — queue it.
      if (prepared) await queueOffline();
      else setFeedback({ kind: "error", message: "The draft could not be saved. No order was submitted. Reload to recover the saved draft." });
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
    <div className="space-y-3">
      <section className="rounded-xl border border-stone-200 bg-white p-2 shadow-sm" aria-label="Open bills">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-black text-white disabled:opacity-50"
            type="button"
            disabled={!draft || pending || !!draft.attempt || !!draftStore.error}
            onClick={() => { void runDraftOperation(draftStore.hold); }}
          >
            <Plus size={16} />
            New bill
          </button>
          {draftStore.drafts.map((row) => {
            const count = Object.values(row.lines).reduce((sum, line) => sum + line.quantity, 0);
            const amount = Object.values(row.lines).reduce((sum, line) => sum + line.quantity * line.price, 0);
            const label = row.fields.table_number
              ? `Table ${row.fields.table_number}`
              : row.fields.customer_name || fulfilmentLabels[row.fulfilmentType];
            return (
              <button
                aria-current={draft?.id === row.id ? "page" : undefined}
                className={`focus-ring shrink-0 rounded-lg border px-3 py-1.5 text-left ${draft?.id === row.id ? "border-leaf bg-mint text-leaf" : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"}`}
                disabled={pending || !!draft?.attempt || !!draftStore.error}
                key={row.id}
                onClick={() => { void runDraftOperation(() => draftStore.resume(row.id)); }}
                type="button"
              >
                <span className="block text-xs font-black">{label}</span>
                <span className="block text-[11px] font-semibold opacity-75">{count} items · {formatCurrency(amount, restaurant)}</span>
              </button>
            );
          })}
          <p role="status" className={`ml-auto shrink-0 px-2 text-xs font-bold ${draftStore.error ? "text-rose-700" : "text-stone-500"}`}>{draftStore.error || draftStore.status}</p>
          <button type="button" className="shrink-0 rounded-lg px-2 py-2 text-xs font-bold text-stone-500 hover:bg-rose-50 hover:text-rose-700" disabled={!draft || pending || !!draft.attempt || !!draftStore.error} onClick={() => { if (window.confirm("Discard this unfinished bill?")) void runDraftOperation(clearTicket); }}>Discard</button>
        </div>
        {draft?.attempt ? <p className="font-bold text-amber-800">A submission is being checked. Retry this unchanged bill to avoid a duplicate.</p> : null}
      </section>
      <fieldset disabled={!draft || !!draftStore.error || pending} className="min-w-0">
      {/* Offline queue — orders punched while disconnected, waiting to sync. */}
      {!isAddingToOrder ? (
        <QueuedOrdersPanel
          onDiscard={discard}
          onRetry={retry}
          queue={queue}
          restaurant={restaurant}
          syncingId={syncingId}
        />
      ) : null}

      <div className="grid min-w-0 gap-3 pb-24 lg:grid-cols-[minmax(0,1.65fr)_minmax(22rem,0.85fr)] lg:items-start lg:pb-0">
      {/* Menu picker */}
      <section className="min-w-0 flex flex-col rounded-xl border border-stone-200 bg-white p-3 shadow-sm lg:h-[calc(100dvh-10.5rem)] lg:min-h-[36rem]">
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

        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div className="flex shrink-0 gap-2 overflow-x-auto pb-1 lg:w-36 lg:flex-col lg:overflow-y-auto lg:pb-0 lg:pr-1" aria-label="Menu categories">
          <button
            className={`focus-ring whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-black ${selectedCategoryId === "all" ? "bg-ink text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
            onClick={() => setSelectedCategoryId("all")}
            type="button"
          >
            All items
          </button>
          {categoriesWithItems.map((category) => (
            <button
              className={`focus-ring whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-black ${selectedCategoryId === category.id ? "bg-leaf text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
              key={category.id}
              onClick={() => setSelectedCategoryId(category.id)}
              type="button"
            >
              {category.name}
            </button>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto pr-1">
        <QuickProduct menu={{ ...menu, items: [...menu.items, ...extraItems] }} search={search} categoryId={selectedCategoryId} disabled={!draft || !!draft?.attempt || pending} onAdd={(item, quantity) => {
          if (availableItems.some(existing => existing.id === item.id) && (resolvedGroupsByItemId.get(item.id) ?? []).length > 0) { handleAdd(item.id); return; }
          setExtraItems(current => [...current.filter(row => row.id !== item.id), item]);
          addTicketLine(item, [], quantity);
        }} />
        <div className="mt-3 space-y-6">
          {matchingItems ? (
            <ItemGrid
              items={matchingItems.map((item) => ({
                id: item.id,
                name: item.name,
                hasOptions: (resolvedGroupsByItemId.get(item.id) ?? []).length > 0,
                price: item.price
              }))}
              onAdd={handleAdd}
              restaurant={restaurant}
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
                    restaurant={restaurant}
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
        </div>
        </div>
      </section>

      {/* Ticket */}
      <section className="min-w-0 lg:h-[calc(100dvh-10.5rem)] lg:min-h-[36rem]">
        <form
          className="min-w-0 flex h-full flex-col rounded-xl border border-stone-200 bg-white p-3 shadow-sm"
          key={draft?.id}
          onSubmit={handleSubmit}
        >
          <div className="flex shrink-0 items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">Current bill</h2>
              <p className="text-xs font-semibold text-stone-500">{draft?.fields.customer_name || (draft?.fields.table_number ? `Table ${draft.fields.table_number}` : "Walk-in customer")}</p>
            </div>
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-black text-stone-600">{itemCount} item{itemCount === 1 ? "" : "s"}</span>
          </div>
          {needsReview ? <div role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {menuReview.ok ? "Menu prices have changed since this bill was saved." : menuReview.error}
            {menuReview.ok ? <button type="button" className="mt-2 block font-bold underline" onClick={() => {
              setLines(current => Object.fromEntries(Object.entries(current).map(([key, line], index) => [key, { ...line, price: menuReview.items[index].price }])));
            }}>Use current menu prices</button> : <p>Remove and re-add the affected item before submitting.</p>}
          </div> : null}

          {/* Order type stays visible while the item list scrolls. */}
          <fieldset className="mt-3 shrink-0">
            <legend className="sr-only">Order type</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {orderTypes.map((type) => (
                <button
                  className={`focus-ring rounded-lg border px-2 py-2 text-xs font-black ${fulfilmentType === type ? "border-leaf bg-mint text-leaf" : "border-stone-200 text-stone-600 hover:bg-stone-50"}`}
                  key={type}
                  disabled={isAddingToOrder || !!draft?.attempt}
                  onClick={() => setFulfilmentType(type)}
                  type="button"
                >
                  {fulfilmentLabels[type]}
                </button>
              ))}
            </div>
          </fieldset>

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
                    className="min-w-0 rounded-lg border border-stone-100 px-3 py-2"
                    key={lineKey}
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p
                          className="line-clamp-2 break-words text-sm font-bold leading-tight"
                          title={line.name}
                        >
                          {line.name}
                        </p>
                        {optionsText ? (
                          <p className="truncate text-xs text-stone-500">{optionsText}</p>
                        ) : null}
                        <p className="mt-0.5 text-xs text-stone-500">
                          {formatCurrency(line.price, restaurant)}
                        </p>
                      </div>
                      <button
                        aria-label={`Remove ${line.name}`}
                        className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => removeItem(lineKey)}
                        type="button"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2 border-t border-stone-100 pt-2">
                      <div className="flex shrink-0 items-center gap-1">
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
                      <span className="ml-auto shrink-0 whitespace-nowrap text-right text-sm font-black">
                        {formatCurrency(line.price * line.quantity, restaurant)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {fulfilmentType === "delivery" ? (
            <div className="mt-3 space-y-3">
              <label className="block text-sm font-bold text-stone-700">
                Delivery area
                <input
                  className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                  maxLength={120}
                  name="delivery_area"
                value={draft?.fields.delivery_area ?? addToOrder?.delivery_area ?? ""}
                onChange={event => { void draftStore.patch({ fields: { ...draft?.fields, delivery_area: event.target.value } }).catch(() => {}); }}
                  readOnly={isAddingToOrder || !!draft?.attempt}
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
                value={draft?.fields.delivery_address ?? addToOrder?.delivery_address ?? ""}
                onChange={event => { void draftStore.patch({ fields: { ...draft?.fields, delivery_address: event.target.value } }).catch(() => {}); }}
                  readOnly={isAddingToOrder || !!draft?.attempt}
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
                value={draft?.fields.delivery_landmark ?? addToOrder?.delivery_landmark ?? ""}
                onChange={event => { void draftStore.patch({ fields: { ...draft?.fields, delivery_landmark: event.target.value } }).catch(() => {}); }}
                  readOnly={isAddingToOrder || !!draft?.attempt}
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
                value={draft?.fields.car_plate_number ?? addToOrder?.car_plate_number ?? ""}
                onChange={event => { void draftStore.patch({ fields: { ...draft?.fields, car_plate_number: event.target.value } }).catch(() => {}); }}
                  readOnly={isAddingToOrder || !!draft?.attempt}
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
                value={draft?.fields.car_description ?? addToOrder?.car_description ?? ""}
                onChange={event => { void draftStore.patch({ fields: { ...draft?.fields, car_description: event.target.value } }).catch(() => {}); }}
                  readOnly={isAddingToOrder || !!draft?.attempt}
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
                value={draft?.fields.table_number ?? addToOrder?.table_number ?? ""}
                onChange={event => { void draftStore.patch({ fields: { ...draft?.fields, table_number: event.target.value } }).catch(() => {}); }}
                readOnly={isAddingToOrder || !!draft?.attempt}
                required
                type="text"
              />
            </label>
          ) : null}

          {/* Optional customer + notes */}
          <details className="mt-4 rounded-lg border border-stone-200 bg-stone-50">
            <summary className="focus-ring flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-black text-stone-700">
              <span>Customer & notes <span className="font-semibold text-stone-400">(optional)</span></span>
              <ChevronDown size={15} />
            </summary>
          <div className="space-y-3 border-t border-stone-200 p-3">
            {!isAddingToOrder ? (
              <StaffCreditCustomerSelector
                canManageCredit={canManageCredit}
                customers={creditCustomers}
                disabled={Boolean(draft?.attempt)}
                onClear={() => {
                  void draftStore.patch({
                    fields: {
                      ...draft?.fields,
                      credit_customer_id: "",
                      customer_name: "",
                      customer_phone: ""
                    }
                  }).catch(() => {});
                }}
                onSelect={(customer) => {
                  void draftStore.patch({
                    fields: {
                      ...draft?.fields,
                      credit_customer_id: customer.id,
                      customer_name: customer.name,
                      customer_phone: customer.phone
                    }
                  }).catch(() => {});
                }}
                restaurant={restaurant}
                selectedCustomerId={selectedCreditCustomerId}
                total={total}
              />
            ) : null}
            <label className="block text-sm font-bold text-stone-700">
              Customer name <span className="font-normal text-stone-400">(optional)</span>
              <input
                className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                maxLength={120}
                name="customer_name"
                value={draft?.fields.customer_name ?? addToOrder?.customer_name ?? ""}
                onChange={event => { void draftStore.patch({ fields: { ...draft?.fields, customer_name: event.target.value } }).catch(() => {}); }}
                placeholder="Walk-in customer"
                readOnly={isAddingToOrder || !!draft?.attempt || Boolean(selectedCreditCustomerId)}
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
                value={draft?.fields.customer_phone ?? addToOrder?.customer_phone ?? ""}
                onChange={event => { void draftStore.patch({ fields: { ...draft?.fields, customer_phone: event.target.value } }).catch(() => {}); }}
                readOnly={isAddingToOrder || !!draft?.attempt || Boolean(selectedCreditCustomerId)}
                type="tel"
              />
            </label>
            <label className="block text-sm font-bold text-stone-700">
              Notes <span className="font-normal text-stone-400">(optional)</span>
              <input
                className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2"
                maxLength={1000}
                readOnly={!!draft?.attempt}
                name="notes"
                value={draft?.fields.notes ?? ""}
                onChange={event => { void draftStore.patch({ fields: { ...draft?.fields, notes: event.target.value } }).catch(() => {}); }}
                placeholder={isAddingToOrder ? "Optional note for the added items" : undefined}
                type="text"
              />
            </label>
          </div>
          </details>

          {/* Close scrollable order body */}
          </div>

          {/* Pinned footer: totals + actions stay visible without scrolling */}
          <div className="mt-3 shrink-0 space-y-3 border-t border-stone-100 pt-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm text-stone-600">
                <span className="font-bold">
                  {itemCount} item{itemCount === 1 ? "" : "s"}
                </span>
                <span>{formatCurrency(subtotal, restaurant)}</span>
              </div>
              {appliedDeliveryFee > 0 ? (
                <div className="flex items-center justify-between text-sm text-stone-600">
                  <span className="font-bold">Delivery fee</span>
                  <span>{formatCurrency(appliedDeliveryFee, restaurant)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-stone-600">Total</span>
                <span className="text-lg font-black">{formatCurrency(total, restaurant)}</span>
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
                {isAddingToOrder ? (
                  <button
                    className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-black text-stone-700 hover:bg-stone-50"
                    onClick={() => printSavedOrder(feedback.order!, ["kot"])}
                    type="button"
                  >
                    <Printer size={15} />
                    Reprint add-on KOT
                  </button>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            ) : null}

            {isAddingToOrder ? (
              <button
                className="focus-ring w-full rounded-lg bg-leaf px-4 py-3 font-black text-white disabled:opacity-60"
                disabled={pending || ticketLines.length === 0 || needsReview}
                name="action"
                type="submit"
                value="kitchen"
              >
                {pending ? "Saving…" : "Add items & print KOT"}
              </button>
            ) : showPaymentPanel ? (
              <div className="fixed inset-x-3 bottom-3 z-40 rounded-xl border border-leaf/30 bg-white p-3 shadow-2xl lg:static lg:bg-mint/40 lg:shadow-none">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-black">Collect payment</p>
                    <p className="text-xs font-semibold text-stone-500">Amount due {formatCurrency(total, restaurant)}</p>
                  </div>
                  <button className="rounded-lg px-2 py-1 text-xs font-bold text-stone-500 hover:bg-white" onClick={() => { setShowPaymentPanel(false); setPrintCustomerBill(false); }} type="button">Cancel</button>
                </div>
                <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs font-bold text-stone-600">
                  <input checked={printCustomerBill} className="h-4 w-4 accent-emerald-600" onChange={(event) => setPrintCustomerBill(event.target.checked)} type="checkbox" />
                  <ReceiptText size={15} /> Print customer bill
                </label>
                {selectedCreditCustomer ? (
                  <div className="mb-2">
                    <button className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-3 text-sm font-black text-white disabled:opacity-50" disabled={pending || ticketLines.length === 0 || needsReview || total > selectedCreditCustomer.available} name="action" type="submit" value="paid_credit">
                      <BookUser size={17} /> Customer Credit · {selectedCreditCustomer.name}
                    </button>
                    {total > selectedCreditCustomer.available ? (
                      <p className="mt-1 text-xs font-bold text-amber-800">Above available credit ({formatCurrency(selectedCreditCustomer.available, restaurant)}). Collect cash/card or send KOT.</p>
                    ) : null}
                  </div>
                ) : null}
                <div className={`grid gap-2 ${restaurant.country_code === "IN" ? "grid-cols-3" : "grid-cols-2"}`}>
                  <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-leaf px-3 py-3 text-sm font-black text-white disabled:opacity-60" disabled={pending || ticketLines.length === 0 || needsReview} name="action" type="submit" value="paid_cash">
                    <Banknote size={17} /> Cash
                  </button>
                  <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-3 py-3 text-sm font-black text-white disabled:opacity-60" disabled={pending || ticketLines.length === 0 || needsReview} name="action" type="submit" value="paid_card">
                    <CreditCard size={17} /> Card
                  </button>
                  {restaurant.country_code === "IN" ? (
                    <button className="focus-ring rounded-lg bg-violet-700 px-3 py-3 text-sm font-black text-white disabled:opacity-50" disabled={pending || ticketLines.length === 0 || needsReview} name="action" type="submit" value="paid_upi">UPI</button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-leaf px-3 py-3 text-sm font-black text-leaf disabled:opacity-60" disabled={pending || ticketLines.length === 0 || needsReview} name="action" type="submit" value="kitchen">
                  <ChefHat size={17} /> {pending ? "Saving…" : "Send KOT"}
                </button>
                <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-leaf px-3 py-3 text-sm font-black text-white disabled:opacity-60" disabled={pending || ticketLines.length === 0 || needsReview} onClick={() => setShowPaymentPanel(true)} type="button">
                  <CreditCard size={17} /> Pay {formatCurrency(total, restaurant)}
                </button>
              </div>
            )}
          </div>

          {/* Mobile: keep billing one tap away without scrolling to the ticket */}
          {ticketLines.length > 0 && !showPaymentPanel ? (
            <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-stone-200 bg-white p-3 shadow-lg lg:hidden">
              <div className="flex-1">
                <p className="text-xs font-bold text-stone-500">
                  {itemCount} item{itemCount === 1 ? "" : "s"}
                </p>
                <p className="text-lg font-black">{formatCurrency(total, restaurant)}</p>
              </div>
              <button
                className="focus-ring rounded-lg border border-leaf px-4 py-3 font-black text-leaf disabled:opacity-60"
                disabled={pending}
                name="action"
                type="submit"
                value="kitchen"
              >
                {pending
                  ? "Saving…"
                  : isAddingToOrder
                    ? "Add items"
                    : "Send KOT"}
              </button>
              {!isAddingToOrder ? (
                <button className="focus-ring rounded-lg bg-leaf px-4 py-3 font-black text-white disabled:opacity-60" disabled={pending || needsReview} onClick={() => setShowPaymentPanel(true)} type="button">
                  Pay
                </button>
              ) : null}
            </div>
          ) : null}
        </form>
      </section>
      </div>

      </fieldset>
      {pickerItem ? (
        <ItemOptionsSheet
          basePrice={pickerItem.price}
          groups={resolvedGroupsByItemId.get(pickerItem.id) ?? []}
          item={pickerItem}
          language="en"
          restaurant={restaurant}
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
