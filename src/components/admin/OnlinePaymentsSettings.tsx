"use client";

import dynamic from "next/dynamic";
import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CreditCard, ExternalLink, Loader2 } from "lucide-react";
import {
  refreshOnlinePaymentsStatusAction,
  startOnlinePaymentsAction
} from "@/app/admin/settings/online-payments-actions";
import type { CardPaymentsStatus } from "@/lib/stripe/connect";

// Stripe's embedded components (and their script) load only when shown.
const StripeEmbeddedOnboarding = dynamic(
  () =>
    import("@/components/admin/StripeEmbeddedOnboarding").then(
      (module) => module.StripeEmbeddedOnboarding
    ),
  { ssr: false, loading: () => <div className="mt-4 h-40 animate-pulse rounded-lg bg-stone-100" /> }
);

export type OnlinePaymentsView = {
  canManage: boolean;
  countrySupported: boolean;
  publishableKey: string;
  testMode: boolean;
  account: {
    status: CardPaymentsStatus;
    requirementsDue: boolean;
    dashboardUrl: string;
  } | null;
};

export function OnlinePaymentsSettings({ view }: { view: OnlinePaymentsView }) {
  const router = useRouter();
  const [state, start, starting] = useActionState(startOnlinePaymentsAction, {});
  const [refreshing, startRefresh] = useTransition();
  const refresh = () =>
    startRefresh(async () => {
      await refreshOnlinePaymentsStatusAction();
      router.refresh();
    });

  const active = view.account?.status === "active";

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black">
            <CreditCard className="text-leaf" size={20} />
            Online payments
            {view.testMode ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-800">Test mode</span>
            ) : null}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Let customers pay by card, Apple Pay or Google Pay when they order. Payments go straight to your
            restaurant&apos;s own Stripe account and are paid out to your bank. WhatsOrder never holds your money.
          </p>
        </div>
        {view.account ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-black ${
              active ? "bg-mint text-leaf" : "bg-amber-50 text-amber-800"
            }`}
          >
            {active ? <CheckCircle2 size={15} /> : null}
            {active ? "Ready to accept payments" : view.account.status === "restricted" ? "Action needed" : "Setup in progress"}
          </span>
        ) : null}
      </div>

      {!view.countrySupported ? (
        <p className="mt-4 rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-600">
          Online payments are available for UAE restaurants for now.
        </p>
      ) : !view.canManage ? (
        <p className="mt-4 rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-600">
          Only the restaurant owner or admin can set up online payments.
        </p>
      ) : !view.account ? (
        <form action={start} className="mt-4">
          <ul className="mb-4 list-inside list-disc space-y-1 text-sm text-stone-600">
            <li>You&apos;ll need your UAE trade licence and your business bank account details.</li>
            <li>Stripe charges its card fees directly to your account; WhatsOrder adds no fee.</li>
            <li>You can manage payouts and refunds in your own Stripe Dashboard.</li>
          </ul>
          <button
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-leaf px-4 py-2.5 text-sm font-black text-white disabled:opacity-60"
            disabled={starting}
            type="submit"
          >
            {starting ? <Loader2 className="animate-spin" size={16} /> : <CreditCard size={16} />}
            Set up online payments
          </button>
          {state.error ? <p className="mt-3 text-sm font-semibold text-rose-700">{state.error}</p> : null}
        </form>
      ) : (
        <div className="mt-4">
          {active ? (
            <StripeEmbeddedOnboarding mode="banner" publishableKey={view.publishableKey} />
          ) : (
            <>
              <p className="text-sm text-stone-600">
                Complete the steps below to start accepting payments. You can stop and come back any time.
              </p>
              <div className="mt-4">
                <StripeEmbeddedOnboarding mode="onboarding" onExit={refresh} publishableKey={view.publishableKey} />
              </div>
            </>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-sm font-black text-ink"
              href={view.account.dashboardUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Open Stripe Dashboard
              <ExternalLink size={14} />
            </a>
            <button
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold text-stone-600"
              disabled={refreshing}
              onClick={refresh}
              type="button"
            >
              {refreshing ? <Loader2 className="animate-spin" size={14} /> : null}
              Check status
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
