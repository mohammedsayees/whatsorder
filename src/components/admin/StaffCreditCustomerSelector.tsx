"use client";

import Link from "next/link";
import { CreditCard, Search, UserRoundCheck, X } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { formatCurrency } from "@/lib/currency";
import type { Restaurant, StaffCreditCustomerOption } from "@/lib/types";

function optionLabel(customer: StaffCreditCustomerOption) {
  return `${customer.name} · ${customer.phone}`;
}

export function StaffCreditCustomerSelector({
  canManageCredit,
  customers,
  disabled,
  onClear,
  onSelect,
  restaurant,
  selectedCustomerId,
  total
}: {
  canManageCredit: boolean;
  customers: StaffCreditCustomerOption[];
  disabled: boolean;
  onClear: () => void;
  onSelect: (customer: StaffCreditCustomerOption) => void;
  restaurant: Restaurant;
  selectedCustomerId: string;
  total: number;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const customerById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers]
  );
  const customerByLabel = useMemo(
    () => new Map(customers.map((customer) => [optionLabel(customer), customer])),
    [customers]
  );
  const selected = customerById.get(selectedCustomerId);

  if (selected) {
    const shortfall = Math.max(0, total - selected.available);
    return (
      <section className="rounded-lg border border-blue-200 bg-blue-50 p-3">
        <div className="flex items-start gap-2">
          <UserRoundCheck className="mt-0.5 shrink-0 text-blue-700" size={18} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-black text-blue-950">{selected.name}</p>
            <p className="truncate text-xs font-semibold text-blue-700">
              {selected.phone} · Credit customer
            </p>
          </div>
          <button
            aria-label={`Clear ${selected.name}`}
            className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-lg text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            disabled={disabled}
            onClick={onClear}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg bg-white p-2">
            <p className="text-stone-500">Outstanding</p>
            <p className="mt-0.5 font-black text-blue-950">
              {formatCurrency(selected.balance, restaurant)}
            </p>
          </div>
          <div className="rounded-lg bg-white p-2">
            <p className="text-stone-500">Available</p>
            <p className="mt-0.5 font-black text-leaf">
              {formatCurrency(selected.available, restaurant)}
            </p>
          </div>
          <div className="rounded-lg bg-white p-2">
            <p className="text-stone-500">Terms</p>
            <p className="mt-0.5 font-black text-blue-950">
              {selected.terms_days === 0 ? "Due today" : `${selected.terms_days} days`}
            </p>
          </div>
        </div>

        {selected.overdue > 0 ? (
          <p className="mt-2 rounded-lg bg-rose-100 px-2.5 py-2 text-xs font-bold text-rose-800">
            {formatCurrency(selected.overdue, restaurant)} is overdue. Management should review before extending more credit.
          </p>
        ) : null}
        {shortfall > 0 ? (
          <p className="mt-2 rounded-lg bg-amber-100 px-2.5 py-2 text-xs font-bold text-amber-900">
            This bill is {formatCurrency(shortfall, restaurant)} above the available credit. It can go to the kitchen, but Customer Credit stays unavailable unless the balance or limit changes.
          </p>
        ) : (
          <p className="mt-2 text-xs font-semibold text-blue-700">
            The customer is attached. Tap Pay → Customer Credit to charge the ledger now, or Send KOT and complete it as Customer Credit from Orders later.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-stone-50 p-3">
      <div className="flex items-center gap-2">
        <CreditCard className="text-blue-700" size={18} />
        <div>
          <p className="text-sm font-black text-stone-800">Existing credit customer</p>
          <p className="text-xs text-stone-500">
            Search by customer name or phone number.
          </p>
        </div>
      </div>

      {customers.length > 0 ? (
        <label className="relative mt-3 block">
          <span className="sr-only">Select an existing credit customer</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            size={17}
          />
          <input
            autoComplete="off"
            className="focus-ring w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-sm"
            disabled={disabled}
            list={listId}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              const match = customerByLabel.get(value);
              if (match) {
                onSelect(match);
                setQuery("");
              }
            }}
            placeholder="Type a name or phone…"
            type="search"
            value={query}
          />
          <datalist id={listId}>
            {customers.map((customer) => (
              <option key={customer.id} value={optionLabel(customer)}>
                {formatCurrency(customer.available, restaurant)} available
              </option>
            ))}
          </datalist>
        </label>
      ) : (
        <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-stone-600">
          No enabled credit customers are recorded yet.
        </p>
      )}

      <p className="mt-2 text-xs text-stone-500">
        {canManageCredit ? (
          <>
            Need a new account?{" "}
            <Link className="font-bold text-blue-700 underline" href="/admin/customers">
              Manage credit customers
            </Link>
            .
          </>
        ) : (
          "Ask a manager to add or change a credit account."
        )}
      </p>

      {selectedCustomerId ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-bold text-amber-800">
          <span>The saved customer is no longer available for credit.</span>
          <button
            className="focus-ring shrink-0 underline"
            disabled={disabled}
            onClick={onClear}
            type="button"
          >
            Clear
          </button>
        </div>
      ) : null}
    </section>
  );
}
