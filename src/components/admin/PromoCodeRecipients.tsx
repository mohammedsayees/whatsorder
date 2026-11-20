"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Search, UserMinus, UserPlus } from "lucide-react";
import {
  assignPromoRecipientAction,
  listPromoRecipientsAction,
  removePromoRecipientAction,
  searchPromoRecipientsAction,
  type RecipientsResult
} from "@/app/admin/marketing/promo-codes/actions";
import { maskPhone, type VoucherRecipient } from "@/lib/promo-assignments";

/**
 * Who may use a personal (assigned) promo code. Owners search their own
 * customers and add or remove them; the code then shows in those customers'
 * account Vouchers tab, and checkout refuses it for anyone else.
 */
export function PromoCodeRecipients({ code, promoCodeId }: { code: string; promoCodeId: string }) {
  const [recipients, setRecipients] = useState<VoucherRecipient[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VoucherRecipient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [searching, startSearch] = useTransition();

  useEffect(() => {
    let active = true;
    void listPromoRecipientsAction(promoCodeId).then((result) => {
      if (!active) return;
      if (result.ok) setRecipients(result.recipients);
      else setError(result.error);
    });
    return () => {
      active = false;
    };
  }, [promoCodeId]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      startSearch(async () => {
        const result = await searchPromoRecipientsAction(trimmed);
        if (result.ok) setResults(result.recipients);
        else setError(result.error);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  function run(action: () => Promise<RecipientsResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) setRecipients(result.recipients);
      else setError(result.error);
    });
  }

  const assigned = new Set((recipients ?? []).map((recipient) => recipient.customerId));
  const label = (recipient: VoucherRecipient) => recipient.name?.trim() || "Customer";

  return (
    <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
      <p className="text-xs font-black uppercase tracking-wide text-stone-500">
        Customers who can use {code}
      </p>

      {recipients === null && !error ? (
        <p className="mt-2 inline-flex items-center gap-2 text-sm text-stone-500">
          <Loader2 className="animate-spin" size={14} /> Loading…
        </p>
      ) : recipients && recipients.length === 0 ? (
        <p className="mt-2 text-sm text-stone-500">Nobody yet. Search below to add customers.</p>
      ) : (
        <ul className="mt-2 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {(recipients ?? []).map((recipient) => (
            <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm" key={recipient.customerId}>
              <span className="min-w-0">
                <span className="block truncate font-bold">{label(recipient)}</span>
                <span className="text-xs text-stone-500" dir="ltr">{maskPhone(recipient.phone)}</span>
              </span>
              <button
                className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-black text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                disabled={pending}
                onClick={() => run(() => removePromoRecipientAction(promoCodeId, recipient.customerId))}
                type="button"
              >
                <UserMinus size={13} /> Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="mt-3 block">
        <span className="sr-only">Search customers</span>
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={15} />
          <input
            className="focus-ring w-full rounded-lg border border-stone-200 bg-white py-2 pl-9 pr-3 text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your customers by name or phone"
            value={query}
          />
        </span>
      </label>
      {searching ? (
        <p className="mt-2 inline-flex items-center gap-2 text-xs text-stone-500">
          <Loader2 className="animate-spin" size={13} /> Searching…
        </p>
      ) : null}
      {results.length > 0 ? (
        <ul className="mt-2 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {results.map((customer) => (
            <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm" key={customer.customerId}>
              <span className="min-w-0">
                <span className="block truncate font-bold">{label(customer)}</span>
                <span className="text-xs text-stone-500" dir="ltr">{maskPhone(customer.phone)}</span>
              </span>
              {assigned.has(customer.customerId) ? (
                <span className="shrink-0 text-xs font-black text-emerald-700">Added</span>
              ) : (
                <button
                  className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-lg bg-leaf px-2.5 py-1 text-xs font-black text-white disabled:opacity-50"
                  disabled={pending}
                  onClick={() => run(() => assignPromoRecipientAction(promoCodeId, customer.customerId))}
                  type="button"
                >
                  <UserPlus size={13} /> Add
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : query.trim().length >= 2 && !searching ? (
        <p className="mt-2 text-xs text-stone-500">No matching customers.</p>
      ) : null}

      {error ? <p className="mt-2 text-xs font-bold text-rose-700" role="alert">{error}</p> : null}
      <p className="mt-2 text-xs text-stone-500">
        They&apos;ll see it under Vouchers when signed in. Share the code with them as you usually do; nobody else can use it.
      </p>
    </div>
  );
}
