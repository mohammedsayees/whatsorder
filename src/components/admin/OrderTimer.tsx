"use client";
import { useEffect, useState } from "react";
import { orderTiming } from "@/lib/order-timing";
import type { Order } from "@/lib/types";

export function OrderTimer({ order, target }: { order: Order; target: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(id); }, []);
  if (now === null) return <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-black text-stone-500">Timing…</span>;
  const timer = orderTiming(order, target, now);
  const colors = { neutral: "bg-stone-100 text-stone-600", green: "bg-emerald-50 text-emerald-800", amber: "bg-amber-50 text-amber-800", red: "bg-rose-50 text-rose-800" };
  const label = timer.overdue > 0
    ? `${timer.overdue} min overdue`
    : timer.stopped
      ? `${timer.minutes ?? 0} min total`
      : timer.minutes === null
        ? "Timing unavailable"
        : timer.tone === "amber"
          ? `${timer.minutes} min · Due soon`
          : `${timer.minutes} min`;

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${colors[timer.tone]}`}>
      {label}
    </span>
  );
}
