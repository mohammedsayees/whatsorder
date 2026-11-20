"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Gift, Loader2, Phone, Plus, Stamp } from "lucide-react";
import { lookupStampCustomerAction } from "@/app/admin/orders/actions";
import {
  maskedPhone,
  stampLookupPhone,
  stampMessage,
  stampSummary,
  type StampLookup,
  type StampMessage
} from "@/lib/stamp-lookup";

const TONES: Record<StampMessage["tone"], string> = {
  new: "border-sky-200 bg-sky-50 text-sky-800",
  progress: "border-emerald-200 bg-emerald-50 text-emerald-800",
  ready: "border-amber-300 bg-amber-100 text-amber-900"
};

/**
 * The customer's phone at the counter, for the stamp card. Collapsed to a
 * one-line chip so it doesn't eat ticket space: "+ Add customer phone for
 * stamp" when empty, "050…123 · 4/10 stamps" once entered. A complete number
 * is looked up (exact match, this café only) to show stamp progress; saving
 * the order gives the stamp. A full card offers "Redeem free … on this order".
 */
export function StaffStampPhone({
  onChange,
  onGreetingName,
  onRedeemChange,
  phoneCountryCode,
  readOnly,
  redeem,
  value
}: {
  onChange: (value: string) => void;
  /** Called with a returning customer's first name so the ticket can use it. */
  onGreetingName: (name: string) => void;
  /** Staff chose (or cleared) "redeem the reward on this order". */
  onRedeemChange: (redeem: boolean) => void;
  phoneCountryCode: string;
  readOnly: boolean;
  redeem: boolean;
  value: string;
}) {
  const [lookup, setLookup] = useState<StampLookup | null>(null);
  const [checking, setChecking] = useState(false);
  const [editing, setEditing] = useState(false);
  const lookupFor = stampLookupPhone(value, phoneCountryCode);
  const latest = useRef<string | null>(null);
  const greet = useRef(onGreetingName);
  greet.current = onGreetingName;
  const setRedeem = useRef(onRedeemChange);
  setRedeem.current = onRedeemChange;
  const [rewardLabel, setRewardLabel] = useState<string | null>(null);
  const redeemRef = useRef(redeem);
  redeemRef.current = redeem;

  useEffect(() => {
    latest.current = lookupFor;
    // A different (or incomplete) number never keeps a reward chosen for the last one.
    setRewardLabel(null);
    if (redeemRef.current) setRedeem.current(false);
    if (!lookupFor) {
      setLookup(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    const timer = window.setTimeout(() => {
      void lookupStampCustomerAction(lookupFor)
        .then((result) => {
          if (latest.current !== lookupFor) return;
          setLookup(result ?? null);
          if (result?.status === "known" && result.name) greet.current(result.name);
          setRewardLabel(
            result?.status === "known" && result.stamps >= result.required
              ? result.reward?.trim() || "reward"
              : null
          );
        })
        .catch(() => {
          // Offline or unavailable: the stamp is still given when the order syncs.
          if (latest.current === lookupFor) setLookup(null);
        })
        .finally(() => {
          if (latest.current === lookupFor) setChecking(false);
        });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [lookupFor]);

  const message = lookup ? stampMessage(lookup) : null;
  const summary = lookup ? stampSummary(lookup) : null;
  const hasValue = value.trim() !== "";

  const redeemButton =
    !checking && rewardLabel ? (
      <button
        aria-pressed={redeem}
        className={`focus-ring mt-1.5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-black ${
          redeem ? "bg-amber-500 text-white" : "border-2 border-amber-400 bg-white text-amber-900"
        }`}
        disabled={readOnly}
        onClick={() => onRedeemChange(!redeem)}
        onMouseDown={(event) => {
          // Keep the phone field from blurring/collapsing before the click lands.
          event.preventDefault();
        }}
        type="button"
      >
        {redeem ? <Check size={16} /> : <Gift size={16} />}
        {redeem ? `Free ${rewardLabel} on this order · tap to undo` : `Redeem free ${rewardLabel} on this order`}
      </button>
    ) : null;

  if (editing && !readOnly) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-2">
        <label className="flex items-center gap-2">
          <Stamp aria-hidden className="shrink-0 text-stone-500" size={16} />
          <span className="sr-only">Stamp card · customer phone</span>
          <input
            autoComplete="off"
            autoFocus
            className="focus-ring block min-h-10 w-full min-w-0 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-base font-bold tracking-wide"
            inputMode="tel"
            maxLength={24}
            name="customer_phone"
            onBlur={() => setEditing(false)}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              // Enter would submit the ticket form; treat it as "done".
              if (event.key === "Enter") {
                event.preventDefault();
                setEditing(false);
              }
            }}
            placeholder="05x xxx xxxx"
            type="tel"
            value={value}
          />
        </label>
        {checking ? (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-stone-500">
            <Loader2 className="animate-spin" size={13} /> Checking stamps…
          </p>
        ) : message ? (
          <p className={`mt-1.5 rounded-md border px-2 py-1 text-xs font-black ${TONES[message.tone]}`} role="status">
            {message.text}
          </p>
        ) : !hasValue ? (
          <p className="mt-1 text-xs font-semibold text-stone-500">
            Ask: &ldquo;Collect a stamp? What&apos;s your number?&rdquo;
          </p>
        ) : null}
        {redeemButton}
      </div>
    );
  }

  return (
    <div>
      <input name="customer_phone" type="hidden" value={value} />
      {hasValue ? (
        <button
          className={`focus-ring flex min-h-10 w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-sm font-black ${message ? TONES[message.tone] : "border-stone-200 bg-white text-stone-700"} disabled:cursor-default`}
          disabled={readOnly}
          onClick={() => setEditing(true)}
          title={message?.text ?? "Edit customer phone"}
          type="button"
        >
          {message?.tone === "ready" ? <Gift aria-hidden size={16} /> : <Phone aria-hidden size={15} />}
          <span className="tabular-nums">{maskedPhone(value)}</span>
          {checking ? (
            <Loader2 aria-label="Checking stamps" className="animate-spin text-stone-400" size={13} />
          ) : summary ? (
            <span className="min-w-0 truncate font-bold">· {summary}</span>
          ) : null}
          <span className="sr-only" role="status">{message?.text ?? ""}</span>
        </button>
      ) : (
        <button
          className="focus-ring inline-flex min-h-10 w-full items-center gap-1.5 rounded-lg border border-dashed border-stone-300 px-3 py-1.5 text-sm font-bold text-stone-600 hover:border-stone-400 hover:bg-stone-50 disabled:opacity-50"
          disabled={readOnly}
          onClick={() => setEditing(true)}
          type="button"
        >
          <Plus aria-hidden size={15} /> Add customer phone for stamp
        </button>
      )}
      {redeemButton}
    </div>
  );
}
