"use client";

import { useActionState } from "react";
import { BellRing, CreditCard, Loader2, ReceiptText, WalletCards } from "lucide-react";

import {
  configureCustomerCreditAction,
  createCreditCustomerAction,
  recordCustomerCreditPaymentAction,
  sendCustomerCreditReminderAction,
  writeOffCustomerCreditAction,
  type CustomerCreditActionState
} from "@/app/admin/customers/credit-actions";
import { formatCurrency } from "@/lib/currency";
import { formatRestaurantDate, formatRestaurantDateTime } from "@/lib/date-time";
import type {
  Customer,
  CustomerCreditEntry,
  CustomerCreditSummary,
  Restaurant
} from "@/lib/types";

const initialState: CustomerCreditActionState = {};

export function AddCreditCustomerForm() {
  const [state, action, pending] = useActionState(
    createCreditCustomerAction,
    initialState
  );
  return (
    <details className="mt-4 rounded-lg border border-blue-200 bg-white p-4 shadow-sm">
      <summary className="focus-ring cursor-pointer rounded font-black text-blue-900">
        + Add credit customer
      </summary>
      <p className="mt-2 text-sm text-stone-600">
        Creates a customer account for order processing only. Marketing consent remains off.
      </p>
      <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm"
          disabled={pending}
          maxLength={120}
          name="name"
          placeholder="Customer name"
          required
        />
        <input
          className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm"
          disabled={pending}
          inputMode="tel"
          maxLength={24}
          name="phone"
          placeholder="WhatsApp number"
          required
        />
        <input
          className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm"
          defaultValue="500"
          disabled={pending}
          min="0.01"
          name="credit_limit"
          placeholder="Credit limit"
          required
          step="0.01"
          type="number"
        />
        <select
          aria-label="Payment terms"
          className="focus-ring rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
          defaultValue="7"
          disabled={pending}
          name="terms_days"
        >
          <option value="0">Due today</option>
          <option value="7">Due in 7 days</option>
          <option value="14">Due in 14 days</option>
          <option value="30">Due in 30 days</option>
          <option value="60">Due in 60 days</option>
        </select>
        <input
          className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm"
          defaultValue="0"
          disabled={pending}
          min="0"
          name="opening_balance"
          placeholder="Opening balance (optional)"
          step="0.01"
          type="number"
        />
        <select
          aria-label="Automatic reminders"
          className="focus-ring rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
          defaultValue="true"
          disabled={pending}
          name="reminders_enabled"
        >
          <option value="true">Automatic reminders on</option>
          <option value="false">Automatic reminders off</option>
        </select>
        <label className="flex items-start gap-2 text-xs font-semibold text-stone-600 sm:col-span-2">
          <input
            className="mt-0.5"
            disabled={pending}
            name="customer_agreed"
            required
            type="checkbox"
            value="yes"
          />
          Customer agreed that the restaurant may keep these details to manage the credit account and payment reminders.
        </label>
        <button
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-black text-white disabled:opacity-60 sm:col-span-2"
          disabled={pending}
          type="submit"
        >
          {pending ? <Loader2 className="animate-spin" size={15} /> : <CreditCard size={15} />}
          Add credit customer
        </button>
      </form>
      <ActionMessage state={state} />
    </details>
  );
}

function ActionMessage({ state }: { state: CustomerCreditActionState }) {
  const message = state.error ?? state.warning ?? state.success;
  if (!message) return null;
  return (
    <p
      className={`mt-2 rounded-lg px-3 py-2 text-xs font-bold ${
        state.error
          ? "bg-rose-50 text-rose-700"
          : state.warning
            ? "bg-amber-50 text-amber-800"
            : "bg-emerald-50 text-emerald-800"
      }`}
      role={state.error ? "alert" : "status"}
    >
      {message}
    </p>
  );
}

function entryLabel(entry: CustomerCreditEntry) {
  switch (entry.entry_type) {
    case "charge":
      return entry.order_id
        ? `Credit order #${entry.order_id.slice(-8).toUpperCase()}`
        : "Credit order";
    case "payment":
      return `Payment received${entry.payment_method ? ` · ${entry.payment_method.replace("_", " ")}` : ""}`;
    case "write_off":
      return "Balance written off";
    case "reversal":
      return "Correction reversal";
    default:
      return entry.note || "Balance adjustment";
  }
}

export function CustomerCreditPanel({
  customer,
  restaurant,
  summary,
  canWriteOff
}: {
  customer: Pick<Customer, "id" | "name">;
  restaurant: Restaurant;
  summary?: CustomerCreditSummary;
  canWriteOff: boolean;
}) {
  const [settingsState, settingsAction, settingsPending] = useActionState(
    configureCustomerCreditAction,
    initialState
  );
  const [paymentState, paymentAction, paymentPending] = useActionState(
    recordCustomerCreditPaymentAction,
    initialState
  );
  const [reminderState, reminderAction, reminderPending] = useActionState(
    sendCustomerCreditReminderAction,
    initialState
  );
  const [writeOffState, writeOffAction, writeOffPending] = useActionState(
    writeOffCustomerCreditAction,
    initialState
  );
  const money = (value: number) => formatCurrency(value, restaurant);
  const account = summary?.account;

  return (
    <section className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
      <div className="flex items-center gap-2">
        <WalletCards className="text-blue-700" size={19} />
        <h3 className="font-black text-blue-950">Customer credit</h3>
        {account ? (
          <span
            className={`ml-auto rounded-full px-2.5 py-1 text-xs font-black ${
              account.is_enabled
                ? "bg-emerald-100 text-emerald-800"
                : "bg-stone-200 text-stone-600"
            }`}
          >
            {account.is_enabled ? "Enabled" : "Paused"}
          </span>
        ) : null}
      </div>

      {summary ? (
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-lg bg-white p-2.5">
            <p className="text-xs text-stone-500">Outstanding</p>
            <p className="font-black text-blue-950">{money(summary.balance)}</p>
          </div>
          <div className="rounded-lg bg-white p-2.5">
            <p className="text-xs text-stone-500">Overdue</p>
            <p className={summary.overdue > 0 ? "font-black text-rose-700" : "font-black"}>
              {money(summary.overdue)}
            </p>
          </div>
          <div className="rounded-lg bg-white p-2.5">
            <p className="text-xs text-stone-500">Available</p>
            <p className="font-black text-leaf">{money(summary.available)}</p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-blue-800">
          Enable pay-later orders for this customer and set a safe credit limit.
        </p>
      )}

      <details className="mt-3 rounded-lg border border-blue-100 bg-white p-3">
        <summary className="focus-ring cursor-pointer rounded text-sm font-black text-blue-900">
          {account ? "Credit settings" : "Enable customer credit"}
        </summary>
        <form action={settingsAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input name="customer_id" type="hidden" value={customer.id} />
          <label className="text-xs font-bold text-stone-600">
            Status
            <select
              className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2"
              defaultValue={account?.is_enabled === false ? "false" : "true"}
              disabled={settingsPending}
              name="is_enabled"
            >
              <option value="true">Credit enabled</option>
              <option value="false">Credit paused</option>
            </select>
          </label>
          <label className="text-xs font-bold text-stone-600">
            Credit limit
            <input
              className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
              defaultValue={account?.credit_limit ?? 500}
              disabled={settingsPending}
              min="0"
              name="credit_limit"
              required
              step="0.01"
              type="number"
            />
          </label>
          <label className="text-xs font-bold text-stone-600">
            Payment terms
            <select
              className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2"
              defaultValue={account?.terms_days ?? 7}
              disabled={settingsPending}
              name="terms_days"
            >
              <option value="0">Due today</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
            </select>
          </label>
          <label className="text-xs font-bold text-stone-600">
            Automatic reminders
            <select
              className="focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2"
              defaultValue={account?.reminders_enabled === false ? "false" : "true"}
              disabled={settingsPending}
              name="reminders_enabled"
            >
              <option value="true">Enabled</option>
              <option value="false">Paused</option>
            </select>
          </label>
          {!account ? (
            <label className="text-xs font-bold text-stone-600 sm:col-span-2">
              Opening balance <span className="font-normal text-stone-400">(optional)</span>
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
                defaultValue="0"
                disabled={settingsPending}
                min="0"
                name="opening_balance"
                step="0.01"
                type="number"
              />
            </label>
          ) : (
            <input name="opening_balance" type="hidden" value="0" />
          )}
          <button
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60 sm:col-span-2"
            disabled={settingsPending}
            type="submit"
          >
            {settingsPending ? <Loader2 className="animate-spin" size={15} /> : <CreditCard size={15} />}
            Save credit settings
          </button>
        </form>
        <ActionMessage state={settingsState} />
      </details>

      {summary && summary.balance > 0 ? (
        <>
          <form action={paymentAction} className="mt-3 rounded-lg border border-emerald-200 bg-white p-3">
            <input name="customer_id" type="hidden" value={customer.id} />
            <p className="text-sm font-black text-emerald-900">Record a payment</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                aria-label="Credit payment amount"
                className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm"
                disabled={paymentPending}
                max={summary.balance}
                min="0.01"
                name="amount"
                placeholder="Amount"
                required
                step="0.01"
                type="number"
              />
              <select
                aria-label="Credit payment method"
                className="focus-ring rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
                disabled={paymentPending}
                name="payment_method"
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                {restaurant.country_code === "IN" ? <option value="upi">UPI</option> : null}
                <option value="bank_transfer">Bank transfer</option>
                <option value="other">Other</option>
              </select>
              <input
                className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm sm:col-span-2"
                disabled={paymentPending}
                maxLength={300}
                name="note"
                placeholder="Reference or note (optional)"
              />
              <button
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-black text-white disabled:opacity-60 sm:col-span-2"
                disabled={paymentPending}
                type="submit"
              >
                {paymentPending ? <Loader2 className="animate-spin" size={15} /> : <ReceiptText size={15} />}
                Record payment
              </button>
            </div>
            <ActionMessage state={paymentState} />
          </form>

          <form action={reminderAction} className="mt-3">
            <input name="customer_id" type="hidden" value={customer.id} />
            <button
              className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2.5 text-sm font-black text-blue-800 disabled:opacity-60"
              disabled={reminderPending}
              type="submit"
            >
              {reminderPending ? <Loader2 className="animate-spin" size={15} /> : <BellRing size={15} />}
              Send WhatsApp reminder now
            </button>
            <ActionMessage state={reminderState} />
          </form>

          {canWriteOff ? (
            <details className="mt-3 rounded-lg border border-rose-100 bg-white p-3">
              <summary className="focus-ring cursor-pointer rounded text-xs font-black text-rose-700">
                Write off uncollectable balance
              </summary>
              <form action={writeOffAction} className="mt-2 grid gap-2">
                <input name="customer_id" type="hidden" value={customer.id} />
                <input
                  className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm"
                  disabled={writeOffPending}
                  max={summary.balance}
                  min="0.01"
                  name="amount"
                  placeholder="Amount"
                  required
                  step="0.01"
                  type="number"
                />
                <input
                  className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm"
                  disabled={writeOffPending}
                  maxLength={300}
                  name="note"
                  placeholder="Required reason"
                  required
                />
                <button
                  className="focus-ring rounded-lg border border-rose-300 px-3 py-2 text-sm font-black text-rose-700 disabled:opacity-60"
                  disabled={writeOffPending}
                  type="submit"
                >
                  {writeOffPending ? "Saving…" : "Record write-off"}
                </button>
              </form>
              <ActionMessage state={writeOffState} />
            </details>
          ) : null}
        </>
      ) : null}

      {summary?.lastReminder ? (
        <p className="mt-3 text-xs text-stone-500">
          Last reminder: {formatRestaurantDateTime(summary.lastReminder.created_at, restaurant)} ·{" "}
          {summary.lastReminder.delivery_status.replace("_", " ")}
        </p>
      ) : null}

      {summary && summary.entries.length > 0 ? (
        <details className="mt-3 rounded-lg border border-blue-100 bg-white p-3">
          <summary className="focus-ring cursor-pointer rounded text-sm font-black text-blue-900">
            Credit statement ({summary.entries.length})
          </summary>
          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
            {summary.entries.map((entry) => (
              <div className="rounded-lg bg-stone-50 p-2.5 text-xs" key={entry.id}>
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-black text-stone-700">{entryLabel(entry)}</p>
                    <p className="mt-0.5 text-stone-500">
                      {formatRestaurantDateTime(entry.created_at, restaurant)}
                      {entry.due_date
                        ? ` · Due ${formatRestaurantDate(entry.due_date, restaurant)}`
                        : ""}
                    </p>
                    {entry.note && entry.entry_type !== "adjustment" ? (
                      <p className="mt-1 text-stone-500">{entry.note}</p>
                    ) : null}
                  </div>
                  <p className={Number(entry.amount) > 0 ? "font-black text-rose-700" : "font-black text-emerald-700"}>
                    {Number(entry.amount) > 0 ? "+" : "−"}
                    {money(Math.abs(Number(entry.amount)))}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
