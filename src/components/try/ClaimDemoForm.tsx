"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { claimDemoRestaurantAction, type ClaimFormState } from "@/app/try/claim/actions";
import { normalizeStoreSlug, storeSlugError } from "@/lib/store-slug";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500";
const labelClass = "block text-sm font-semibold text-emerald-950";

const initialValues: Record<string, string> = {
  owner_email: "",
  whatsapp_number: "",
  accepting_orders: "on"
};

const nextSteps = [
  "Open your dashboard immediately",
  "Place and accept one test order",
  "Share your store link or download its QR code"
];

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
    { error: null, values: { ...initialValues, slug: suggestedSlug } }
  );
  const values = state.values;
  const [slug, setSlug] = useState(values.slug ?? suggestedSlug);
  const normalizedSlug = normalizeStoreSlug(slug);
  const slugHint = storeSlugError(normalizedSlug);

  return (
    <form action={formAction} className="mt-7 space-y-5">
      {/* Safe launch defaults keep the claim short. Owners can enable delivery
          only after adding its operational details in Settings. */}
      <input name="pickup_enabled" type="hidden" value="on" />
      <input name="delivery_fee" type="hidden" value="0" />
      <input name="minimum_order_amount" type="hidden" value="0" />
      <input name="hours_mode" type="hidden" value="always" />

      <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <p className="font-bold">Your menu is ready.</p>
          <p className="mt-1 text-emerald-900/80">
            Start with takeaway orders. Delivery, detailed hours and fees can be added later
            from Settings.
          </p>
        </div>

        <label className={`mt-5 ${labelClass}`} htmlFor="claim-whatsapp">
          Restaurant WhatsApp number
        </label>
        <input
          id="claim-whatsapp"
          name="whatsapp_number"
          type="tel"
          required
          autoComplete="tel"
          maxLength={20}
          defaultValue={values.whatsapp_number}
          placeholder={phonePlaceholder}
          className={inputClass}
        />
        <p className="mt-2 text-xs text-slate-500">New customer orders open on this number.</p>

        <label className={`mt-5 ${labelClass}`} htmlFor="claim-email">
          Owner email
        </label>
        <input
          id="claim-email"
          name="owner_email"
          type="email"
          required
          autoComplete="email"
          maxLength={254}
          defaultValue={values.owner_email}
          placeholder="you@restaurant.com"
          className={inputClass}
        />
        <p className="mt-2 text-xs text-slate-500">
          This secures your dashboard. A confirmation link is sent after launch.
        </p>

        <label className={`mt-5 ${labelClass}`} htmlFor="claim-slug">
          Store link <span className="font-normal text-slate-500">(already chosen for you)</span>
        </label>
        <div className="mt-1.5 flex items-center overflow-hidden rounded-xl border border-slate-200 focus-within:border-emerald-500">
          <span className="shrink-0 bg-slate-50 px-3 py-3 text-sm text-slate-500">/r/</span>
          <input
            id="claim-slug"
            name="slug"
            required
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            onBlur={() => setSlug(normalizedSlug)}
            maxLength={60}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 px-3 py-3 outline-none"
          />
        </div>
        <p className={`mt-2 text-xs ${slugHint ? "text-rose-600" : "text-slate-500"}`}>
          {slugHint ?? `${origin}/r/${normalizedSlug}`}
        </p>

        <label className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
          <input
            className="mt-0.5"
            defaultChecked={values.accepting_orders !== "off"}
            name="accepting_orders"
            type="checkbox"
          />
          <span>
            <strong className="block text-emerald-950">Accept takeaway orders immediately</strong>
            Turn this off if you want to finish setup before customers can order.
          </span>
        </label>

        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {countryName} · prices in {currencyCode} · no card required
        </p>

        {state.error ? (
          <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending || Boolean(slugHint)}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3.5 font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-60"
        >
          {pending ? <Loader2 className="animate-spin" size={18} /> : null}
          Make my store live
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <h2 className="font-bold text-emerald-950">What happens next</h2>
        <ol className="mt-3 space-y-2 text-sm text-slate-600">
          {nextSteps.map((step) => (
            <li className="flex items-center gap-2" key={step}>
              <CheckCircle2 className="shrink-0 text-emerald-600" size={17} />
              {step}
            </li>
          ))}
        </ol>
      </section>
    </form>
  );
}
