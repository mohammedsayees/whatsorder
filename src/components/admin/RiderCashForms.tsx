"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import {
  giveRiderFloatAction,
  receiveRiderCashAction,
  type RiderCashState
} from "@/app/admin/riders/cash-actions";

const initialState: RiderCashState = {};

function Feedback({ state }: { state: RiderCashState }) {
  if (state.error) {
    return (
      <p className="mt-2 text-xs font-semibold text-rose-700" role="alert">
        {state.error}
      </p>
    );
  }

  return state.success ? (
    <p className="mt-2 text-xs font-semibold text-leaf" role="status">
      {state.success}
    </p>
  ) : null;
}

const inputClass = "focus-ring w-full rounded-lg border border-stone-200 px-3 py-2 text-sm font-bold";
const buttonClass =
  "focus-ring inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-black disabled:opacity-60";

/** Hand a rider change money (a float) from the till. */
export function GiveRiderCashForm({ riderId, riderName }: { riderId: string; riderName: string }) {
  const [state, formAction, pending] = useActionState(giveRiderFloatAction, initialState);

  return (
    <form action={formAction} className="rounded-lg bg-stone-50 p-3">
      <input name="rider_id" type="hidden" value={riderId} />
      <p className="text-sm font-black">Give change to {riderName}</p>
      <p className="mt-0.5 text-xs text-stone-500">Cash taken from the till so the rider can make change.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[8rem_1fr]">
        <input aria-label="Amount" className={inputClass} inputMode="decimal" name="amount" placeholder="Amount" required />
        <input aria-label="Note" className={inputClass} maxLength={300} name="note" placeholder="Note (optional)" />
      </div>
      <button className={`${buttonClass} mt-2 w-full bg-blue-700 text-white`} disabled={pending} type="submit">
        {pending ? <Loader2 className="animate-spin" size={16} /> : null}
        Record cash given
      </button>
      <Feedback state={state} />
    </form>
  );
}

/** Take cash back from a rider, optionally settling them to zero. */
export function ReceiveRiderCashForm({
  riderId,
  riderName,
  holds
}: {
  riderId: string;
  riderName: string;
  holds: string;
}) {
  const [state, formAction, pending] = useActionState(receiveRiderCashAction, initialState);

  return (
    <form action={formAction} className="rounded-lg bg-stone-50 p-3">
      <input name="rider_id" type="hidden" value={riderId} />
      <p className="text-sm font-black">Receive cash from {riderName}</p>
      <p className="mt-0.5 text-xs text-stone-500">Should be holding {holds}.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[8rem_1fr]">
        <input aria-label="Cash received" className={inputClass} inputMode="decimal" name="amount" placeholder="Received" required />
        <input aria-label="Note" className={inputClass} maxLength={300} name="note" placeholder="Note (needed if different)" />
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs font-bold text-stone-700">
        <input className="h-4 w-4" name="settle" type="checkbox" />
        Settle in full (record any difference — managers only)
      </label>
      <button className={`${buttonClass} mt-2 w-full bg-leaf text-white`} disabled={pending} type="submit">
        {pending ? <Loader2 className="animate-spin" size={16} /> : null}
        Record cash received
      </button>
      <Feedback state={state} />
    </form>
  );
}
