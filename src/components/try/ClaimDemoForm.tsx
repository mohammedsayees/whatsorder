"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";

import { claimDemoRestaurantAction, type ClaimFormState } from "@/app/try/claim/actions";
import { normalizeStoreSlug, storeSlugError } from "@/lib/store-slug";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500";

export default function ClaimDemoForm({
  suggestedSlug,
  countryName,
  currencyCode,
  phonePlaceholder,
  origin
}: {
  suggestedSlug: string;
  countryName: string;
  currencyCode: string;
  phonePlaceholder: string;
  origin: string;
}) {
  const [state, formAction, pending] = useActionState<ClaimFormState, FormData>(
    claimDemoRestaurantAction,
    { error: null, values: { owner_email: "", whatsapp_number: "", slug: suggestedSlug } }
  );
  const [slug, setSlug] = useState(state.values.slug);
  const normalized = normalizeStoreSlug(slug);
  const slugHint = slug ? storeSlugError(normalized) : null;

  return (
    <form action={formAction} className="mt-7 rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
      <label className="block text-sm font-semibold text-emerald-950" htmlFor="claim-slug">
        Your store link
      </label>
      <div className="mt-1.5 flex items-center overflow-hidden rounded-xl border border-slate-200 focus-within:border-emerald-500">
        <span className="shrink-0 bg-slate-50 px-3 py-3 text-sm text-slate-500">/r/</span>
        <input
          id="claim-slug"
          name="slug"
          required
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          onBlur={() => setSlug(normalized)}
          maxLength={60}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-0 flex-1 px-3 py-3 outline-none"
        />
      </div>
      <p className={`mt-2 text-xs ${slugHint ? "text-rose-600" : "text-slate-500"}`}>
        {slugHint ?? (
          <>
            Customers will order at{" "}
            <span className="font-semibold text-slate-700">
              {origin}/r/{normalized || "your-cafe"}
            </span>
            . Print this on your QR codes.
          </>
        )}
      </p>

      <label className="mt-4 block text-sm font-semibold text-emerald-950" htmlFor="claim-whatsapp">
        Restaurant WhatsApp number
      </label>
      <input
        id="claim-whatsapp"
        name="whatsapp_number"
        type="tel"
        required
        autoComplete="tel"
        maxLength={20}
        defaultValue={state.values.whatsapp_number}
        placeholder={phonePlaceholder}
        className={inputClass}
      />
      <p className="mt-2 text-xs text-slate-500">
        New customer orders will open this number, replacing the demo number.
      </p>

      <label className="mt-4 block text-sm font-semibold text-emerald-950" htmlFor="claim-email">
        Owner email
      </label>
      <input
        id="claim-email"
        name="owner_email"
        type="email"
        required
        autoComplete="email"
        maxLength={254}
        defaultValue={state.values.owner_email}
        className={inputClass}
      />

      <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Country: <span className="font-semibold text-slate-800">{countryName}</span> · prices in{" "}
        {currencyCode}.{" "}
        <a href="/try" className="font-semibold text-emerald-800 underline">
          Wrong country? Build again
        </a>
      </p>

      {state.error ? (
        <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3.5 font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-60"
      >
        {pending ? <Loader2 className="animate-spin" size={18} /> : null}
        Claim restaurant &amp; email my activation link
      </button>
      <p className="mt-3 text-center text-xs text-slate-500">
        One restaurant per owner email. 14-day free trial, no card required.
      </p>
    </form>
  );
}
