"use client";
import { useEffect, useState } from "react";
import { orderTiming } from "@/lib/order-timing";
import type { Order } from "@/lib/types";

export function OrderTimer({ order, target }: { order: Order; target: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(id); }, []);
  if (now === null) return <p className="text-sm text-stone-500">Loading timer…</p>;
  const timer = orderTiming(order, target, now);
  const colors = { neutral: "bg-stone-100 text-stone-600", green: "bg-emerald-50 text-emerald-800", amber: "bg-amber-50 text-amber-800", red: "bg-rose-50 text-rose-800" };
  const label = order.status === "New" ? "Waiting" : order.status === "Accepted" ? "Accepted / awaiting preparation" : order.status;
  return <div className={`mt-2 rounded-lg p-2 text-sm ${colors[timer.tone]}`}>
    <p className="font-bold">{label}{!timer.stopped && timer.stageMinutes !== null ? ` · ${timer.stageMinutes} min` : ""}</p>
    <p>Total · {timer.minutes === null ? "Timing unavailable" : `${timer.minutes} min`}{!timer.stopped ? ` · Target ${target} min` : ""}</p>
    {timer.overdue > 0 ? <p className="font-black">{timer.overdue} min overdue</p> : null}
  </div>;
}
