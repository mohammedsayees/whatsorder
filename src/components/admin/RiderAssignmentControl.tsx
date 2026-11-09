"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Bike, Loader2, Send } from "lucide-react";

import {
  assignRiderToOrderAction,
  type AssignRiderState
} from "@/app/admin/riders/actions";
import type { DeliveryRider, OrderRiderAssignment } from "@/lib/types";

const initialState: AssignRiderState = {};

const deliveryLabels: Record<OrderRiderAssignment["delivery_status"], string> = {
  sending: "Sending WhatsApp…",
  accepted: "WhatsApp accepted",
  skipped: "Assigned · WhatsApp not sent",
  failed: "Assigned · WhatsApp failed"
};

export function RiderAssignmentControl({
  orderId,
  riders,
  assignment
}: {
  orderId: string;
  riders: DeliveryRider[];
  assignment?: OrderRiderAssignment;
}) {
  const [state, formAction, pending] = useActionState(
    assignRiderToOrderAction,
    initialState
  );
  const activeRiders = riders.filter((rider) => rider.is_active);
  const assignedRider = assignment
    ? riders.find((rider) => rider.id === assignment.rider_id)
    : undefined;

  if (activeRiders.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        <p className="font-bold">No active delivery riders.</p>
        <Link className="focus-ring mt-1 inline-block rounded font-black underline" href="/admin/settings">
          Add riders in Settings
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
      <div className="flex items-center gap-2 text-sm font-black text-blue-900">
        <Bike size={16} />
        Delivery rider
      </div>
      {assignment ? (
        <p className="mt-1 text-xs font-semibold text-blue-700">
          {assignedRider?.name ?? "Rider"} · {deliveryLabels[assignment.delivery_status]}
        </p>
      ) : null}
      <form action={formAction} className="mt-2 space-y-2">
        <input name="order_id" type="hidden" value={orderId} />
        <label className="sr-only" htmlFor={`rider-${orderId}`}>
          Select delivery rider
        </label>
        <select
          className="focus-ring w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-bold"
          defaultValue={assignment?.rider_id ?? ""}
          disabled={pending}
          id={`rider-${orderId}`}
          name="rider_id"
          required
        >
          <option disabled value="">
            Select rider
          </option>
          {activeRiders.map((rider) => (
            <option key={rider.id} value={rider.id}>
              {rider.name} · {rider.phone}
            </option>
          ))}
        </select>
        <button
          className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2.5 text-sm font-black text-white disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
          {assignment ? "Assign / resend details" : "Assign & send details"}
        </button>
      </form>
      {state.error ? (
        <p className="mt-2 text-xs font-semibold text-rose-700" role="alert">
          {state.error}
        </p>
      ) : state.warning ? (
        <p className="mt-2 text-xs font-semibold text-amber-800" role="status">
          {state.warning}
        </p>
      ) : state.success ? (
        <p className="mt-2 text-xs font-semibold text-leaf" role="status">
          {state.success}
        </p>
      ) : null}
    </div>
  );
}
