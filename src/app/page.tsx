import Link from "next/link";
import { ArrowRight, ClipboardCheck, MessageCircle, Store, TrendingUp } from "lucide-react";

const benefits = [
  {
    title: "Keep WhatsApp as the channel",
    text: "Customers still send the final order on WhatsApp, but the message arrives structured and easy to read.",
    icon: MessageCircle
  },
  {
    title: "Track orders in one place",
    text: "Restaurants get a simple dashboard for status updates, revenue, customers, and menu availability.",
    icon: ClipboardCheck
  },
  {
    title: "Built for small UAE restaurants",
    text: "AED pricing, delivery areas, cash or card on delivery, and mobile-first ordering from day one.",
    icon: Store
  }
];

export default function LandingPage() {
  return (
    <main>
      <section className="bg-ink text-white">
        <div className="mx-auto grid min-h-[88vh] max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_470px] lg:px-8">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-saffron">WhatsOrder</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">
              WhatsApp ordering, made structured for restaurants.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/78">
              A lightweight ordering system for small UAE restaurants that already depend on WhatsApp.
              No marketplace, no payment gateway, no forced operational change.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-leaf px-6 py-3 font-black text-white"
                href="/r/chaixpress"
              >
                Try demo menu
                <ArrowRight size={18} />
              </Link>
              <Link
                className="focus-ring inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3 font-black text-white"
                href="/admin"
              >
                View admin
              </Link>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 text-ink shadow-soft">
            <div className="rounded-xl bg-linen p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-leaf">Chaixpress</p>
                  <h2 className="text-2xl font-black">Today</h2>
                </div>
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-leaf text-white">
                  <TrendingUp size={20} />
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {[
                  ["Orders", "18"],
                  ["Revenue", "AED 642"],
                  ["New", "5"],
                  ["AOV", "AED 35"]
                ].map(([label, value]) => (
                  <div className="rounded-lg bg-white p-3" key={label}>
                    <p className="text-xs font-semibold text-stone-500">{label}</p>
                    <p className="mt-1 text-xl font-black">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                {["New order from Aisha", "Preparing: Zinger Combo", "Completed: Karak Tea"].map((item) => (
                  <div className="flex items-center justify-between rounded-lg bg-white px-3 py-3 text-sm" key={item}>
                    <span className="font-bold">{item}</span>
                    <span className="rounded-full bg-mint px-2 py-1 text-xs font-bold text-leaf">Live</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {benefits.map((benefit) => {
            const Icon = benefit.icon;

            return (
              <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm" key={benefit.title}>
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-mint text-leaf">
                  <Icon size={20} />
                </div>
                <h2 className="mt-5 text-xl font-black">{benefit.title}</h2>
                <p className="mt-3 leading-7 text-stone-600">{benefit.text}</p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
