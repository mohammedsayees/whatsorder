"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Gift, Loader2, Stamp } from "lucide-react";
import { lookupStampCustomerAction } from "@/app/admin/orders/actions";
import { stampLookupPhone, stampMessage, type StampMessage } from "@/lib/stamp-lookup";

const TONES: Record<StampMessage["tone"], string> = {
  new: "bg-sky-50 text-sky-800",
  progress: "bg-emerald-50 text-emerald-800",
  ready: "bg-amber-100 text-amber-900"
};

/**
 * The customer's phone at the counter, labelled as the stamp card so staff
 * ask for it. A complete number is looked up (exact match, this café only)
 * to show stamp progress; saving the order gives the stamp.
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
  const [message, setMessage] = useState<StampMessage | null>(null);
  const [checking, setChecking] = useState(false);
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
      setMessage(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    const timer = window.setTimeout(() => {
      void lookupStampCustomerAction(lookupFor)
        .then((lookup) => {
          if (latest.current !== lookupFor) return;
          setMessage(lookup ? stampMessage(lookup) : null);
          if (lookup?.status === "known" && lookup.name) greet.current(lookup.name);
          setRewardLabel(
            lookup?.status === "known" && lookup.stamps >= lookup.required
              ? lookup.reward?.trim() || "reward"
              : null
          );
        })
        .catch(() => {
          // Offline or unavailable: the stamp is still given when the order syncs.
          if (latest.current === lookupFor) setMessage(null);
        })
        .finally(() => {
          if (latest.current === lookupFor) setChecking(false);
        });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [lookupFor]);

  return (
    <div className="mb-3 rounded-lg border-2 border-stone-200 bg-white p-3">
      <label className="block text-sm font-black text-stone-700">
        <span className="inline-flex items-center gap-1.5">
          <Stamp aria-hidden size={15} /> Stamp card · customer phone
        </span>
        <input
          autoComplete="off"
          className="focus-ring mt-1.5 block min-h-12 w-full rounded-lg border-2 border-stone-300 bg-white px-4 py-3 text-lg font-bold tracking-wide"
          inputMode="tel"
          maxLength={24}
          name="customer_phone"
          onChange={(event) => onChange(event.target.value)}
          placeholder="05x xxx xxxx"
          readOnly={readOnly}
          type="tel"
          value={value}
        />
      </label>
      {checking ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-stone-500">
          <Loader2 className="animate-spin" size={13} /> Checking stamps…
        </p>
      ) : message ? (
        <p className={`mt-2 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-black ${TONES[message.tone]}`} role="status">
          {message.tone === "ready" ? <Gift aria-hidden size={16} /> : <Stamp aria-hidden size={16} />}
          {message.text}
        </p>
      ) : null}
      {!checking && rewardLabel ? (
        <button
          aria-pressed={redeem}
          className={`focus-ring mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-black ${
            redeem ? "bg-amber-500 text-white" : "border-2 border-amber-400 bg-white text-amber-900"
          }`}
          disabled={readOnly}
          onClick={() => onRedeemChange(!redeem)}
          type="button"
        >
          {redeem ? <Check size={16} /> : <Gift size={16} />}
          {redeem ? `Free ${rewardLabel} on this order · tap to undo` : `Redeem free ${rewardLabel} on this order`}
        </button>
      ) : null}
      {!checking && !message && !value.trim() ? (
        <p className="mt-1.5 text-xs font-semibold text-stone-500">
          Ask: &ldquo;Collect a stamp? What&apos;s your number?&rdquo; Paid orders earn the stamp straight away.
        </p>
      ) : null}
    </div>
  );
}
