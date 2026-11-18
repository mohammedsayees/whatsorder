"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  addShiftPaidOutAction,
  attachPaidOutReceiptAction,
  addOtherIncomeAction,
  assignUnassignedOrdersAction,
  closeBusinessDayAction,
  closeShiftAction,
  declareCashCountAction,
  openShiftAction,
  voidOtherIncomeAction,
  voidShiftPaidOutAction,
  type ShiftActionState
} from "@/app/admin/shifts/actions";
import { formatCurrency } from "@/lib/currency";
import { manualOtherIncomeCategoryLabels } from "@/lib/business-day";
import { calculateCashDifference } from "@/lib/shift-calculations";
import {
  reconciliationNeedsNote,
  shiftMarketplaceLabels
} from "@/lib/shift-reconciliation";
import type {
  Restaurant,
  ShiftMarketplaceChannel,
  ShiftMarketplaceSale,
  ShiftMarketplaceStatus
} from "@/lib/types";

const initialState: ShiftActionState = {};

export function CloseBusinessDayButton({ businessDayId }: { businessDayId: string }) {
  const [state, action, pending] = useActionState(closeBusinessDayAction, initialState);
  return (
    <div className="space-y-2">
      <form action={action}>
        <input name="business_day_id" type="hidden" value={businessDayId} />
        <button
          className="focus-ring w-full rounded-lg bg-ink px-4 py-3 font-black text-white disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Closing business day…" : "Close business day & create report"}
        </button>
      </form>
      <ActionMessage state={state} />
    </div>
  );
}

function ActionMessage({ state }: { state: ShiftActionState }) {
  if (!state.error && !state.success) {
    return null;
  }

  return (
    <p
      className={`rounded-lg px-3 py-2 text-sm font-bold ${
        state.error
          ? "bg-rose-50 text-rose-700"
          : "bg-emerald-50 text-emerald-800"
      }`}
      role="status"
    >
      {state.error ?? state.success}
    </p>
  );
}

export type AssignableOrderRow = {
  id: string;
  /** Pre-formatted on the server in the restaurant's time zone. */
  completedLabel: string;
  detailLabel: string;
  total: number;
  isCash: boolean;
};

export function AssignUnassignedOrdersForm({
  orders,
  restaurant,
  shiftId
}: {
  orders: AssignableOrderRow[];
  restaurant: Restaurant;
  shiftId: string;
}) {
  const [state, action, pending] = useActionState(
    assignUnassignedOrdersAction,
    initialState
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(orders.map((order) => order.id))
  );
  const chosen = orders.filter((order) => selected.has(order.id));
  const chosenCash = chosen
    .filter((order) => order.isCash)
    .reduce((sum, order) => sum + order.total, 0);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={action} className="space-y-3">
      <input name="shift_id" type="hidden" value={shiftId} />
      <ul className="max-h-72 divide-y divide-amber-100 overflow-y-auto rounded-lg border border-amber-200 bg-white text-stone-800">
        {orders.map((order) => (
          <li key={order.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
              <input
                checked={selected.has(order.id)}
                className="h-4 w-4 shrink-0 accent-amber-900"
                name="order_id"
                onChange={() => toggle(order.id)}
                type="checkbox"
                value={order.id}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{order.completedLabel}</span>
                <span className="block truncate text-xs text-stone-500">{order.detailLabel}</span>
              </span>
              <span className="shrink-0 font-black">{formatCurrency(order.total, restaurant)}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="text-xs font-semibold">
        {chosen.length} selected · adds {formatCurrency(chosenCash, restaurant)} to expected cash
      </p>
      <button
        className="focus-ring rounded-lg bg-amber-900 px-3 py-2 text-sm font-black text-white disabled:opacity-60"
        disabled={pending || chosen.length === 0}
        type="submit"
      >
        {pending ? "Assigning…" : `Assign ${chosen.length} to current shift`}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export function OpenShiftForm({ restaurant }: { restaurant: Restaurant }) {
  const [state, action, pending] = useActionState(
    openShiftAction,
    initialState
  );

  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-bold text-stone-700">
        Shift name
        <input
          className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-3"
          maxLength={80}
          name="shift_name"
          placeholder="Morning shift"
          required
        />
      </label>
      <label className="block text-sm font-bold text-stone-700">
        Opening cash
        <div className="mt-1 flex overflow-hidden rounded-lg border border-stone-200 bg-white">
          <span className="grid place-items-center bg-stone-100 px-3 text-sm font-black text-stone-600">
            {restaurant.currency_code ?? "AED"}
          </span>
          <input
            className="focus-ring min-w-0 flex-1 px-3 py-3"
            min="0"
            name="opening_cash_amount"
            required
            step="0.01"
            type="number"
          />
        </div>
      </label>
      <label className="block text-sm font-bold text-stone-700">
        Opening note <span className="font-normal text-stone-400">(optional)</span>
        <textarea
          className="focus-ring mt-1 block min-h-24 w-full rounded-lg border border-stone-200 px-3 py-3"
          maxLength={500}
          name="opening_note"
          placeholder="Any handover note"
        />
      </label>
      <ActionMessage state={state} />
      <button
        className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-3 font-black text-white disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? <Loader2 className="animate-spin" size={18} /> : null}
        Open shift
      </button>
    </form>
  );
}

export function PaidOutForm({ restaurant, shiftId }: { restaurant: Restaurant; shiftId: string }) {
  const [state, action, pending] = useActionState(
    addShiftPaidOutAction,
    initialState
  );
  // Controlled so the values survive a duplicate warning round-trip (React
  // resets uncontrolled form fields after every action).
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) {
      setAmount("");
      setReason("");
    }
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input name="shift_id" type="hidden" value={shiftId} />
      <label className="min-w-[130px] flex-1 text-sm font-bold text-stone-700">
        Amount
        <input
          className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5"
          min="0.01"
          name="amount"
          onChange={(event) => setAmount(event.target.value)}
          placeholder={restaurant.currency_code ?? "AED"}
          required
          step="0.01"
          type="number"
          value={amount}
        />
      </label>
      <label className="min-w-[200px] flex-[2] text-sm font-bold text-stone-700">
        Reason
        <input
          className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5"
          maxLength={300}
          name="reason"
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. emergency milk purchase"
          required
          value={reason}
        />
      </label>
      {state.duplicateWarning ? (
        <div className="w-full rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          <p className="font-bold">{state.duplicateWarning}</p>
          <label className="mt-2 flex items-center gap-2 font-bold">
            <input className="h-4 w-4" name="confirm_duplicate" type="checkbox" />
            Yes, this is a separate payment
          </label>
        </div>
      ) : null}
      <button
        className="focus-ring shrink-0 rounded-lg border border-ink px-4 py-2.5 text-sm font-black disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving…" : "Record paid-out"}
      </button>
      <div className="w-full">
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

export function PaidOutReceiptForm({ paidOutId }: { paidOutId: string }) {
  const [state, action, pending] = useActionState(attachPaidOutReceiptAction, initialState);
  if (state.success) {
    return <ActionMessage state={state} />;
  }
  return (
    <details className="mt-2 text-xs">
      <summary className="focus-ring cursor-pointer font-bold text-sky-800">Attach receipt</summary>
      <form action={action} className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input name="paid_out_id" type="hidden" value={paidOutId} />
        <input
          accept="application/pdf,image/jpeg,image/png,image/webp"
          capture="environment"
          className="focus-ring min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 py-2"
          name="receipt"
          required
          type="file"
        />
        <button className="focus-ring rounded-lg border border-sky-300 px-3 py-2 font-black text-sky-800 disabled:opacity-60" disabled={pending} type="submit">{pending ? "Uploading…" : "Upload"}</button>
      </form>
      <p className="mt-1 text-stone-500">Photo or PDF up to 10 MB. It goes privately to Finance for review.</p>
      <ActionMessage state={state} />
    </details>
  );
}

export function VoidPaidOutForm({
  paidOutId,
  shiftId,
  closedShift = false
}: {
  paidOutId: string;
  shiftId: string;
  closedShift?: boolean;
}) {
  const [state, action, pending] = useActionState(voidShiftPaidOutAction, initialState);
  return (
    <details className="mt-2 text-xs">
      <summary className="focus-ring cursor-pointer font-bold text-rose-700">Void incorrect paid-out</summary>
      <form action={action} className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input name="paid_out_id" type="hidden" value={paidOutId} />
        <input name="shift_id" type="hidden" value={shiftId} />
        <input className="focus-ring min-w-0 flex-1 rounded-lg border border-stone-200 px-2 py-2" maxLength={300} name="reason" placeholder="Reason, e.g. same bill entered twice" required />
        <button className="focus-ring rounded-lg border border-rose-300 px-3 py-2 font-black text-rose-700 disabled:opacity-60" disabled={pending} type="submit">{pending ? "Voiding…" : "Confirm void"}</button>
      </form>
      {closedShift ? (
        <p className="mt-1 text-stone-500">This saves a new version of the close report. Counted cash and notes stay as entered.</p>
      ) : null}
      <ActionMessage state={state} />
    </details>
  );
}

export function OtherIncomeForm({
  restaurant,
  shiftId
}: {
  restaurant: Restaurant;
  shiftId: string;
}) {
  const [state, action, pending] = useActionState(addOtherIncomeAction, initialState);
  return (
    <form action={action} className="space-y-3">
      <input name="shift_id" type="hidden" value={shiftId} />
      <div className="flex flex-wrap gap-3">
        <label className="min-w-[160px] flex-1 text-sm font-bold text-stone-700">
          Category
          <select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5" name="category" required>
            {Object.entries(manualOtherIncomeCategoryLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="min-w-[160px] flex-1 text-sm font-bold text-stone-700">
          Payment method
          <select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5" name="payment_method" required>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            {restaurant.country_code === "IN" ? <option value="upi">UPI</option> : null}
            <option value="bank_transfer">Bank transfer</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="min-w-[140px] flex-1 text-sm font-bold text-stone-700">
          Amount
          <input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" min="0.01" name="amount" required step="0.01" type="number" />
        </label>
        <label className="min-w-[160px] flex-1 text-sm font-bold text-stone-700">
          Reference <span className="font-normal text-stone-400">(optional)</span>
          <input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" maxLength={120} name="reference" placeholder="Receipt or buyer reference" />
        </label>
      </div>
      <label className="block text-sm font-bold text-stone-700">
        Description
        <input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" maxLength={300} name="description" placeholder="e.g. 35 litres sold to ABC Recycling" required />
      </label>
      <ActionMessage state={state} />
      <button className="focus-ring w-full rounded-lg border border-emerald-700 px-4 py-2.5 text-sm font-black text-emerald-800 disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Saving…" : "Record other income"}
      </button>
    </form>
  );
}

export function VoidOtherIncomeForm({ entryId, shiftId }: { entryId: string; shiftId: string }) {
  const [state, action, pending] = useActionState(voidOtherIncomeAction, initialState);
  return (
    <details className="mt-2 text-xs">
      <summary className="focus-ring cursor-pointer font-bold text-rose-700">Void incorrect entry</summary>
      <form action={action} className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input name="entry_id" type="hidden" value={entryId} />
        <input name="shift_id" type="hidden" value={shiftId} />
        <input className="focus-ring min-w-0 flex-1 rounded-lg border border-stone-200 px-2 py-2" maxLength={300} name="reason" placeholder="Reason (kept in audit history)" required />
        <button className="focus-ring rounded-lg border border-rose-300 px-3 py-2 font-black text-rose-700 disabled:opacity-60" disabled={pending} type="submit">{pending ? "Voiding…" : "Confirm void"}</button>
      </form>
      <ActionMessage state={state} />
    </details>
  );
}

function inputDifference(value: string, expected: number) {
  const amount = Number(value);
  return value !== "" && Number.isFinite(amount)
    ? calculateCashDifference(amount, expected)
    : null;
}

function DifferencePreview({
  difference,
  restaurant
}: {
  difference: number | null;
  restaurant: Restaurant;
}) {
  if (difference === null) {
    return null;
  }

  return (
    <div
      className={`rounded-lg p-3 ${
        difference === 0
          ? "bg-emerald-50 text-emerald-800"
          : "bg-amber-50 text-amber-900"
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-wide">Difference</p>
      <p className="mt-1 text-xl font-black">
        {formatCurrency(difference, restaurant)}
      </p>
    </div>
  );
}

function MarketplaceReconciliationField({
  channel,
  initialSale
}: {
  channel: ShiftMarketplaceChannel;
  initialSale?: ShiftMarketplaceSale;
}) {
  const [status, setStatus] = useState<ShiftMarketplaceStatus | "">(
    initialSale?.status ?? ""
  );
  const label = shiftMarketplaceLabels[channel];

  return (
    <fieldset className="rounded-lg border border-stone-200 p-3">
      <legend className="px-1 text-sm font-black">{label}</legend>
      <label className="block text-xs font-bold text-stone-600">
        Report status
        <select
          className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm"
          name={`marketplace_${channel}_status`}
          onChange={(event) => setStatus(event.target.value as ShiftMarketplaceStatus | "")}
          required
          value={status}
        >
          <option value="">Choose…</option>
          <option value="entered">Enter report total</option>
          <option value="zero">Confirm zero sales</option>
          <option value="unavailable">Report unavailable</option>
        </select>
      </label>
      {status === "entered" ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs font-bold text-stone-600">
            Orders <span className="font-normal text-stone-400">(optional)</span>
            <input
              className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
              defaultValue={initialSale?.order_count ?? ""}
              inputMode="numeric"
              min="0"
              name={`marketplace_${channel}_order_count`}
              step="1"
              type="number"
            />
          </label>
          <label className="text-xs font-bold text-stone-600">
            Gross sales
            <input
              className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
              defaultValue={initialSale?.gross_sales ?? ""}
              min="0"
              name={`marketplace_${channel}_gross_sales`}
              required
              step="0.01"
              type="number"
            />
          </label>
        </div>
      ) : null}
      {status === "zero" ? (
        <p className="mt-3 rounded-lg bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-600">
          You are confirming the {label} report shows no sales for this shift.
        </p>
      ) : null}
      {status === "unavailable" ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          The shift can still close. The report will flag this total as unverified.
        </p>
      ) : null}
      {status ? (
        <label className="mt-3 block text-xs font-bold text-stone-600">
          Note <span className="font-normal text-stone-400">(optional)</span>
          <input
            className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
            defaultValue={initialSale?.note ?? ""}
            maxLength={200}
            name={`marketplace_${channel}_note`}
            placeholder={status === "unavailable" ? "e.g. portal was offline" : ""}
          />
        </label>
      ) : null}
    </fieldset>
  );
}

export function MarketplaceReconciliationFields({
  channels,
  initialSales = []
}: {
  channels: ShiftMarketplaceChannel[];
  initialSales?: ShiftMarketplaceSale[];
}) {
  return (
    <div className="space-y-3">
      {channels.map((channel) => (
        <MarketplaceReconciliationField
          channel={channel}
          initialSale={initialSales.find((sale) => sale.channel === channel)}
          key={channel}
        />
      ))}
    </div>
  );
}

function ActiveOrdersWarning({ count, action }: { count: number; action: string }) {
  if (count === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
      <p className="font-black">
        Resolve {count} active order{count === 1 ? "" : "s"} before {action}
      </p>
      <p className="mt-1 text-xs font-semibold">
        Complete or cancel every pending order, then refresh this page.
      </p>
    </div>
  );
}

// Blind count, step 1. Expected cash is not on this page until the count is locked.
export function DeclareCashCountForm({
  activeOrderCount,
  shiftId
}: {
  activeOrderCount: number;
  shiftId: string;
}) {
  const [state, action, pending] = useActionState(
    declareCashCountAction,
    initialState
  );

  return (
    <form action={action} className="space-y-4">
      <input name="shift_id" type="hidden" value={shiftId} />
      <ActiveOrdersWarning action="counting" count={activeOrderCount} />
      <div className="rounded-lg bg-stone-100 p-3 text-sm text-stone-700">
        <p className="font-black">Step 1 of 2: count the cash drawer</p>
        <p className="mt-1 text-xs leading-5">
          Count every note and coin in the drawer and enter the total. Once locked, the
          count can&apos;t be changed. You&apos;ll then see the expected amount and finish
          closing.
        </p>
      </div>
      <label className="block text-sm font-bold text-stone-700">
        Cash counted
        <input
          className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-3"
          min="0"
          name="cash_counted_amount"
          required
          step="0.01"
          type="number"
        />
      </label>
      <label className="flex items-start gap-2 text-sm font-semibold text-stone-700">
        <input className="mt-1" name="confirm_count" required type="checkbox" />
        I have counted the whole drawer. This count can&apos;t be changed.
      </label>
      <ActionMessage state={state} />
      <button
        className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg bg-leaf px-4 py-3 font-black text-white disabled:opacity-60"
        disabled={pending || activeOrderCount > 0}
        type="submit"
      >
        {pending ? <Loader2 className="animate-spin" size={18} /> : null}
        {pending ? "Locking count…" : "Lock cash count"}
      </button>
    </form>
  );
}

export function CloseShiftForm({
  activeOrderCount,
  declaredCash = null,
  expectedCard,
  expectedCash,
  expectedUpi,
  marketplaceChannels,
  restaurant,
  shiftId
}: {
  activeOrderCount: number;
  /** Locked blind count; when set, the cash field is fixed to it. */
  declaredCash?: number | null;
  expectedCard: number;
  expectedCash: number;
  expectedUpi: number;
  marketplaceChannels: ShiftMarketplaceChannel[];
  restaurant: Restaurant;
  shiftId: string;
}) {
  const [state, action, pending] = useActionState(
    closeShiftAction,
    initialState
  );
  const [cashCounted, setCashCounted] = useState(
    declaredCash === null ? "" : String(declaredCash)
  );
  const [cardTerminalTotal, setCardTerminalTotal] = useState("");
  const [upiReportedTotal, setUpiReportedTotal] = useState("");
  const [closingNote, setClosingNote] = useState("");
  const cashDifference = inputDifference(cashCounted, expectedCash);
  const cardDifference = inputDifference(cardTerminalTotal, expectedCard);
  const upiDifference = restaurant.country_code === "IN"
    ? inputDifference(upiReportedTotal, expectedUpi)
    : null;
  const noteRequired = reconciliationNeedsNote([
    cashDifference,
    cardDifference,
    upiDifference
  ]);
  const submitDisabled =
    pending ||
    activeOrderCount > 0 ||
    (noteRequired && closingNote.trim() === "");

  return (
    <form action={action} className="space-y-4">
      <input name="shift_id" type="hidden" value={shiftId} />
      <ActiveOrdersWarning action="closing" count={activeOrderCount} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-stone-100 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
            Expected cash
          </p>
          <p className="mt-1 text-2xl font-black">{formatCurrency(expectedCash, restaurant)}</p>
        </div>
        <div className="rounded-lg bg-stone-100 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
            Expected card receipts
          </p>
          <p className="mt-1 text-2xl font-black">{formatCurrency(expectedCard, restaurant)}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          {declaredCash === null ? (
            <label className="block text-sm font-bold text-stone-700">
              Cash counted
              <input
                className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-3"
                min="0"
                name="cash_counted_amount"
                onChange={(event) => setCashCounted(event.target.value)}
                required
                step="0.01"
                type="number"
                value={cashCounted}
              />
            </label>
          ) : (
            <div className="text-sm font-bold text-stone-700">
              Cash counted <span className="font-normal text-stone-400">(locked)</span>
              <input name="cash_counted_amount" type="hidden" value={String(declaredCash)} />
              <p className="mt-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 font-black">
                {formatCurrency(declaredCash, restaurant)}
              </p>
            </div>
          )}
          <DifferencePreview difference={cashDifference} restaurant={restaurant} />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-bold text-stone-700">
            Card terminal total
            <input
              className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-3"
              min="0"
              name="card_terminal_total"
              onChange={(event) => setCardTerminalTotal(event.target.value)}
              required
              step="0.01"
              type="number"
              value={cardTerminalTotal}
            />
          </label>
          <DifferencePreview difference={cardDifference} restaurant={restaurant} />
        </div>
      </div>
      {restaurant.country_code === "IN" ? (
        <div className="space-y-2">
          <div className="rounded-lg bg-stone-100 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
              Expected UPI receipts
            </p>
            <p className="mt-1 text-2xl font-black">
              {formatCurrency(expectedUpi, restaurant)}
            </p>
          </div>
          <label className="block text-sm font-bold text-stone-700">
            UPI app / QR report total
            <input
              className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-3"
              min="0"
              name="upi_reported_total"
              onChange={(event) => setUpiReportedTotal(event.target.value)}
              required
              step="0.01"
              type="number"
              value={upiReportedTotal}
            />
          </label>
          <DifferencePreview difference={upiDifference} restaurant={restaurant} />
        </div>
      ) : null}
      {marketplaceChannels.length > 0 ? (
        <div>
          <h3 className="text-sm font-black">Delivery platform totals</h3>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            Use each platform&apos;s shift report. If it is offline, mark it unavailable;
            this will be clearly flagged without blocking closure.
          </p>
          <div className="mt-3">
            <MarketplaceReconciliationFields channels={marketplaceChannels} />
          </div>
        </div>
      ) : null}
      <label className="block text-sm font-bold text-stone-700">
        Closing note{" "}
        <span className="font-normal text-stone-400">
          {noteRequired ? "(required)" : "(optional)"}
        </span>
        <textarea
          className={`focus-ring mt-1 block min-h-24 w-full rounded-lg border px-3 py-3 ${
            noteRequired && closingNote.trim() === ""
              ? "border-amber-400 bg-amber-50"
              : "border-stone-200"
          }`}
          maxLength={500}
          name="closing_note"
          onChange={(event) => setClosingNote(event.target.value)}
          value={closingNote}
        />
      </label>
      {noteRequired ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
          Explain every cash, card or UPI shortage/excess before closing.
        </p>
      ) : null}
      <ActionMessage state={state} />
      <button
        className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg bg-leaf px-4 py-3 font-black text-white disabled:opacity-60"
        disabled={submitDisabled}
        type="submit"
      >
        {pending ? <Loader2 className="animate-spin" size={18} /> : null}
        Close shift
      </button>
    </form>
  );
}
