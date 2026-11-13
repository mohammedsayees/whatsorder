import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";

import { getLaunchMilestoneState } from "@/lib/onboarding-progress";
import type { OnboardingProgress } from "@/lib/types";

type LaunchStep = {
  key: "storeReady" | "testOrderComplete" | "storeShared";
  title: string;
  description: string;
  action: string;
  href: string;
  newTab?: boolean;
};

export function OnboardingProgressCard({
  progress,
  restaurantSlug,
  acceptingOrders
}: {
  progress: OnboardingProgress;
  restaurantSlug: string;
  acceptingOrders: boolean;
}) {
  if (progress.total === 0) {
    return null;
  }

  const state = getLaunchMilestoneState(progress);
  const steps: LaunchStep[] = [
    {
      key: "storeReady",
      title: "Store ready",
      description: "Your menu and WhatsApp number are connected.",
      action: "View store",
      href: `/r/${restaurantSlug}`,
      newTab: true
    },
    {
      key: "testOrderComplete",
      title: acceptingOrders ? "Complete one test order" : "Turn on orders and test",
      description: acceptingOrders
        ? "Order from your menu, then accept it in the dashboard."
        : "Enable ordering in Settings before placing your test order.",
      action: state.testOrderComplete
        ? "View orders"
        : acceptingOrders
          ? "Place test order"
          : "Turn on orders",
      href: state.testOrderComplete
        ? "/admin/orders"
        : acceptingOrders
          ? `/r/${restaurantSlug}?onboarding=test-order`
          : "/admin/settings",
      newTab: !state.testOrderComplete && acceptingOrders
    },
    {
      key: "storeShared",
      title: "Share with customers",
      description: "Download your QR code or copy the permanent store link.",
      action: "Get QR and link",
      href: "/admin/menu/print"
    }
  ];
  const completed = steps.filter((step) => state[step.key]).length;

  if (completed === steps.length) {
    return null;
  }

  const nextStep = steps.find((step) => !state[step.key]);

  return (
    <section className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-leaf">Launch your store</p>
          <h2 className="mt-1 text-xl font-black">Three steps, then you&apos;re ready</h2>
          <p className="mt-1 text-sm text-stone-600">Advanced settings can wait until after your first order.</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-emerald-900">
          {completed} of {steps.length}
        </span>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {steps.map((step) => {
          const isComplete = state[step.key];
          const isNext = nextStep?.key === step.key;

          return (
            <article
              className={`rounded-xl border p-4 ${
                isNext
                  ? "border-emerald-400 bg-white shadow-sm"
                  : "border-emerald-100 bg-white/70"
              }`}
              key={step.key}
            >
              <div className="flex items-start gap-3">
                {isComplete ? (
                  <CheckCircle2 className="mt-0.5 shrink-0 text-leaf" size={20} />
                ) : (
                  <Circle className="mt-0.5 shrink-0 text-stone-300" size={20} />
                )}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black text-ink">{step.title}</h3>
                    {isNext ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-emerald-800">
                        Next
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-stone-600">{step.description}</p>
                </div>
              </div>
              <Link
                className={`mt-4 inline-flex items-center gap-1 text-sm font-black ${
                  isComplete ? "text-stone-500" : "text-leaf"
                }`}
                href={step.href}
                rel={step.newTab ? "noopener" : undefined}
                target={step.newTab ? "_blank" : undefined}
              >
                {step.action}
                <ArrowRight size={15} />
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
