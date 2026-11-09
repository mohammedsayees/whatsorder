import type { Metadata } from "next";
import Link from "next/link";

import { claimDemoRestaurantAction } from "@/app/try/claim/actions";

export const metadata: Metadata = {
  title: "Claim your restaurant — WhatsOrder",
  description: "Keep your AI-built menu, store link and order history, then start a free 14-day trial."
};

export default async function ClaimDemoRestaurantPage({
  searchParams
}: {
  searchParams: Promise<{
    error?: string;
    sent?: string;
    claimed?: string;
    invite_error?: string;
  }>;
}) {
  const query = await searchParams;

  return (
    <main className="min-h-screen bg-[#FDFDFB] px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-lg">
        <Link href="/try" className="text-sm font-semibold text-emerald-800 hover:underline">
          ← Back to demo builder
        </Link>

        {query.sent ? (
          <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-7">
            <h1 className="text-2xl font-bold text-emerald-950">Check your email</h1>
            <p className="mt-3 leading-7 text-emerald-900/80">
              We sent an activation link to the owner email you entered. Verify that email and
              choose a password to open your restaurant dashboard. Your menu, link and order
              history are already preserved.
            </p>
          </section>
        ) : query.claimed ? (
          <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-7">
            <h1 className="text-2xl font-bold text-amber-950">Your restaurant is secured</h1>
            <p className="mt-3 leading-7 text-amber-900/80">{query.invite_error}</p>
          </section>
        ) : (
          <>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-emerald-950">
              Make this your real restaurant.
            </h1>
            <p className="mt-3 text-slate-600">
              Keep the same menu, slug and order history. Start a 14-day trial with no card;
              we&apos;ll verify the owner email before dashboard access.
            </p>

            <form action={claimDemoRestaurantAction} className="mt-7 rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
              <label className="block text-sm font-semibold text-emerald-950" htmlFor="claim-email">
                Owner email
              </label>
              <input
                id="claim-email"
                name="owner_email"
                type="email"
                required
                autoComplete="email"
                maxLength={254}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500"
              />

              <label className="mt-4 block text-sm font-semibold text-emerald-950" htmlFor="claim-country">
                Restaurant country
              </label>
              <select
                id="claim-country"
                name="country_code"
                required
                defaultValue="AE"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-emerald-500"
              >
                <option value="AE">United Arab Emirates</option>
                <option value="IN">India</option>
              </select>

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
                placeholder="971 55 123 4567"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500"
              />
              <p className="mt-2 text-xs text-slate-500">
                New customer orders will open this number, replacing the demo number.
              </p>

              {query.error ? (
                <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {query.error}
                </p>
              ) : null}

              <button
                type="submit"
                className="mt-5 w-full rounded-full bg-emerald-600 px-6 py-3.5 font-semibold text-white shadow hover:bg-emerald-500"
              >
                Claim restaurant &amp; email my activation link
              </button>
              <p className="mt-3 text-center text-xs text-slate-500">
                One restaurant per owner email. No card required.
              </p>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
