import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";

import ClaimDemoForm from "@/components/try/ClaimDemoForm";
import { getClaimableDemo } from "@/app/try/claim/claimable-demo";
import { getCountryProfile } from "@/lib/localization";
import { suggestStoreSlug } from "@/lib/store-slug";
import { recordOnboardingEvent } from "@/lib/onboarding-events";

export const metadata: Metadata = {
  title: "Claim your restaurant — WhatsOrder",
  description: "Claim your AI-built restaurant menu and start a free 14-day trial."
};

async function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) {
    return configured.replace(/^https?:\/\//, "");
  }
  const host = (await headers()).get("host");
  return host ?? "whatsorder";
}

export default async function ClaimDemoRestaurantPage({
  searchParams
}: {
  searchParams: Promise<{
    sent?: string;
    claimed?: string;
    invite_error?: string;
    link?: string;
    settings?: string;
  }>;
}) {
  const query = await searchParams;
  const storeLink = query.link && /^[a-z0-9-]{3,40}$/.test(query.link) ? `/r/${query.link}` : null;

  if (query.sent || query.claimed) {
    return (
      <main className="min-h-screen bg-[#FDFDFB] px-4 py-10 sm:py-16">
        <div className="mx-auto max-w-lg">
          {query.sent ? (
            <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-7">
              <h1 className="text-2xl font-bold text-emerald-950">Check your email</h1>
              <p className="mt-3 leading-7 text-emerald-900/80">
                We sent an activation link to the owner email you entered. Verify that email and
                choose a password to open your restaurant dashboard. Your menu and order history
                are already saved, and your 14-day free trial has started.
              </p>
            </section>
          ) : (
            <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-7">
              <h1 className="text-2xl font-bold text-amber-950">Your restaurant is secured</h1>
              <p className="mt-3 leading-7 text-amber-900/80">{query.invite_error}</p>
            </section>
          )}
          {query.settings === "0" ? (
            <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              We couldn&apos;t save your initial order settings. Your store is claimed;
              set them in Settings after you sign in.
            </p>
          ) : null}
          {storeLink ? (
            <p className="mt-5 text-center text-sm text-slate-600">
              Your store is live at{" "}
              <a href={storeLink} className="font-semibold text-emerald-800 underline">
                {storeLink}
              </a>
            </p>
          ) : null}
        </div>
      </main>
    );
  }

  const demo = await getClaimableDemo();
  if (demo) {
    await recordOnboardingEvent(demo.id, "claim_viewed", "claim_page");
  }

  return (
    <main className="min-h-screen bg-[#FDFDFB] px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-lg">
        <Link href="/try" className="text-sm font-semibold text-emerald-800 hover:underline">
          ← Back to demo builder
        </Link>

        {demo ? (
          <>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-emerald-950">
              Put {demo.name} live.
            </h1>
            <p className="mt-3 text-slate-600">
              Your menu is ready. Answer a few quick questions and real customers can order
              straight away. Takes about two minutes, no card needed.
            </p>
            <ClaimDemoForm
              suggestedSlug={suggestStoreSlug(demo.name, demo.slug)}
              countryName={getCountryProfile(demo.countryCode).countryName}
              currencyCode={getCountryProfile(demo.countryCode).currencyCode}
              phonePlaceholder={demo.countryCode === "IN" ? "91 98765 43210" : "971 55 123 4567"}
              origin={await siteOrigin()}
            />
          </>
        ) : (
          <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-7">
            <h1 className="text-2xl font-bold text-amber-950">We can&apos;t find your demo store</h1>
            <p className="mt-3 leading-7 text-amber-900/80">
              Claiming works on the same phone or computer you built the demo on, within 7 days.
              Open this page there, or build a new demo. It only takes a minute.
            </p>
            <Link
              href="/try"
              className="mt-5 inline-block rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-500"
            >
              Build my demo store
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}
