"use client";

import { useActionState } from "react";
import { Bike, Loader2 } from "lucide-react";

import {
  createDeliveryRiderAction,
  setDeliveryRiderActiveAction,
  type RiderDirectoryState
} from "@/app/admin/riders/actions";
import type { DeliveryRider } from "@/lib/types";

const initialState: RiderDirectoryState = {};

export function RiderSettings({
  riders,
  canWrite,
  phoneExample
}: {
  riders: DeliveryRider[];
  canWrite: boolean;
  phoneExample: string;
}) {
  const [state, formAction, pending] = useActionState(
    createDeliveryRiderAction,
    initialState
  );

  return (
    <section className="max-w-2xl rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
          <Bike size={19} />
        </div>
        <div>
          <h2 className="text-lg font-black">Delivery riders</h2>
          <p className="mt-1 text-sm text-stone-500">
            Add rider WhatsApp numbers here. Staff can then assign a rider from each delivery order.
          </p>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            An active WhatsApp Web connection can send immediately. With Cloud API, the rider must have messaged the restaurant within the previous 24 hours.
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label>
          <span className="text-sm font-bold">Rider name</span>
          <input
            className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
            disabled={!canWrite || pending}
            maxLength={120}
            name="name"
            required
          />
        </label>
        <label>
          <span className="text-sm font-bold">WhatsApp number</span>
          <input
            className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
            disabled={!canWrite || pending}
            inputMode="tel"
            maxLength={30}
            name="phone"
            placeholder={phoneExample}
            required
          />
        </label>
        <button
          className="focus-ring mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-leaf px-4 py-2 font-black text-white disabled:opacity-60"
          disabled={!canWrite || pending}
          type="submit"
        >
          {pending ? <Loader2 className="animate-spin" size={16} /> : null}
          Add rider
        </button>
      </form>
      {state.error ? (
        <p className="mt-3 text-sm font-semibold text-rose-700" role="alert">
          {state.error}
        </p>
      ) : state.success ? (
        <p className="mt-3 text-sm font-semibold text-leaf" role="status">
          {state.success}
        </p>
      ) : null}

      <div className="mt-5 divide-y divide-stone-100 rounded-lg border border-stone-200">
        {riders.length > 0 ? (
          riders.map((rider) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              key={rider.id}
            >
              <div>
                <p className="font-black">{rider.name}</p>
                <p className="text-sm text-stone-500">{rider.phone}</p>
              </div>
              <form action={setDeliveryRiderActiveAction}>
                <input name="rider_id" type="hidden" value={rider.id} />
                <input
                  name="is_active"
                  type="hidden"
                  value={rider.is_active ? "false" : "true"}
                />
                <button
                  className={`focus-ring rounded-lg border px-3 py-2 text-sm font-black ${
                    rider.is_active
                      ? "border-stone-200 text-stone-600"
                      : "border-leaf text-leaf"
                  }`}
                  disabled={!canWrite}
                  type="submit"
                >
                  {rider.is_active ? "Deactivate" : "Activate"}
                </button>
              </form>
            </div>
          ))
        ) : (
          <p className="px-4 py-6 text-center text-sm text-stone-500">
            No riders added yet.
          </p>
        )}
      </div>
    </section>
  );
}
