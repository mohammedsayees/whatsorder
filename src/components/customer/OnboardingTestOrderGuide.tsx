"use client";

import { useEffect } from "react";
import { CheckCircle2, Circle, FlaskConical } from "lucide-react";

import { recordTestOrderStartedAction } from "@/app/admin/onboarding/actions";

export function OnboardingTestOrderGuide({
  cartCount,
  restaurantId
}: {
  cartCount: number;
  restaurantId: string;
}) {
  useEffect(() => {
    void recordTestOrderStartedAction(restaurantId);
  }, [restaurantId]);

  return (
    <aside className="mx-4 mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-violet-950 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-violet-100">
          <FlaskConical size={19} />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-violet-700">Test order mode</p>
          <h2 className="mt-0.5 font-black">See exactly what your customers experience</h2>
          <p className="mt-1 text-sm text-violet-900/75">
            Use your own contact details. After checkout, return to the dashboard tab and accept the order.
          </p>
        </div>
      </div>
      <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        <li className="flex items-center gap-2 font-bold">
          {cartCount > 0 ? (
            <CheckCircle2 className="shrink-0 text-violet-700" size={17} />
          ) : (
            <Circle className="shrink-0 text-violet-400" size={17} />
          )}
          Add an item
        </li>
        <li className="flex items-center gap-2">
          <Circle className="shrink-0 text-violet-400" size={17} />
          Complete checkout
        </li>
        <li className="flex items-center gap-2">
          <Circle className="shrink-0 text-violet-400" size={17} />
          Accept in dashboard
        </li>
      </ol>
      {cartCount > 0 ? (
        <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-sm font-bold text-violet-800">
          Great — open the cart bar below to continue.
        </p>
      ) : null}
    </aside>
  );
}
