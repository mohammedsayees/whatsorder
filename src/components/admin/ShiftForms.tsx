"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  addShiftPaidOutAction,
  assignUnassignedOrdersAction,
  closeShiftAction,
  openShiftAction,
  type ShiftActionState
} from "@/app/admin/shifts/actions";
import { formatCurrency } from "@/lib/currency";
import { calculateCashDifference } from "@/lib/shift-calculations";
import type { Restaurant } from "@/lib/types";

const initialState: ShiftActionState = {};

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

export function AssignUnassignedOrdersButton() {
  const [state, action, pending] = useActionState(
    assignUnassignedOrdersAction,
    initialState
  );

  return (
    <div className="space-y-2">
      <form action={action}>
        <button
          className="focus-ring rounded-lg bg-amber-900 px-3 py-2 text-sm font-black text-white disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Assigning…" : "Assign to current shift"}
        </button>
      </form>
      <ActionMessage state={state} />
    </div>
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

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[160px_1fr_auto]">
      <input name="shift_id" type="hidden" value={shiftId} />
      <label className="text-sm font-bold text-stone-700">
        Amount
        <input
          className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5"
          min="0.01"
          name="amount"
          placeholder={restaurant.currency_code ?? "AED"}
          required
          step="0.01"
          type="number"
        />
      </label>
      <label className="text-sm font-bold text-stone-700">
        Reason
        <input
          className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5"
          maxLength={300}
          name="reason"
          placeholder="e.g. emergency milk purchase"
          required
        />
      </label>
      <button
        className="focus-ring self-end rounded-lg border border-ink px-4 py-2.5 text-sm font-black disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving…" : "Record paid-out"}
      </button>
      <div className="sm:col-span-3">
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

export function CloseShiftForm({
  activeOrderCount,
  expectedCash,
  restaurant,
  shiftId
}: {
  activeOrderCount: number;
  expectedCash: number;
  restaurant: Restaurant;
  shiftId: string;
}) {
  const [state, action, pending] = useActionState(
    closeShiftAction,
    initialState
  );
  const [cashCounted, setCashCounted] = useState("");
  const [closingNote, setClosingNote] = useState("");
  const countedAmount = Number(cashCounted);
  const hasCount = cashCounted !== "" && Number.isFinite(countedAmount);
  const difference = hasCount
    ? calculateCashDifference(countedAmount, expectedCash)
    : null;
  const noteRequired = difference !== null && difference !== 0;
  const submitDisabled =
    pending ||
    activeOrderCount > 0 ||
    (noteRequired && closingNote.trim() === "");

  return (
    <form action={action} className="space-y-4">
      <input name="shift_id" type="hidden" value={shiftId} />
      {activeOrderCount > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <p className="font-black">
            Resolve {activeOrderCount} active order
            {activeOrderCount === 1 ? "" : "s"} before closing
          </p>
          <p className="mt-1 text-xs font-semibold">
            Complete or cancel every pending order, then refresh this page.
          </p>
        </div>
      ) : null}
      <div className="rounded-lg bg-stone-100 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
          Expected cash
        </p>
        <p className="mt-1 text-2xl font-black">{formatCurrency(expectedCash, restaurant)}</p>
      </div>
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
      {difference !== null ? (
        <div
          className={`rounded-lg p-3 ${
            difference === 0
              ? "bg-emerald-50 text-emerald-800"
              : "bg-amber-50 text-amber-900"
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-wide">Difference</p>
          <p className="mt-1 text-xl font-black">{formatCurrency(difference, restaurant)}</p>
          {difference !== 0 ? (
            <p className="mt-1 text-xs font-bold">
              A closing note is required to explain the shortage or excess.
            </p>
          ) : null}
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
