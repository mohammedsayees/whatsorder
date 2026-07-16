import type { Metadata } from "next";
import Link from "next/link";

import InstantDemoBuilder from "@/components/try/InstantDemoBuilder";

export const metadata: Metadata = {
  title: "See your menu live in 2 minutes — WhatsOrder",
  description:
    "Upload a photo of your menu and AI builds your restaurant's WhatsApp ordering page instantly. Free demo, no signup."
};

export default function TryPage() {
  return (
    <main className="min-h-screen bg-[#FDFDFB] px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-xl">
        <Link href="/" className="text-sm font-semibold text-emerald-800 hover:underline">
          ← WhatsOrder
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-emerald-950 sm:text-4xl">
          See your menu live in 2 minutes.
        </h1>
        <p className="mt-3 text-slate-600">
          Upload a photo of your menu. Our AI reads it and builds your restaurant&apos;s own
          WhatsApp ordering page — free, no signup, yours to try for 7 days.
        </p>

        <div className="mt-8">
          <InstantDemoBuilder />
        </div>

        <ol className="mt-8 space-y-2 text-sm text-slate-500">
          <li>1. Snap your menu (a phone photo works)</li>
          <li>2. AI reads every item and price</li>
          <li>3. Your store goes live — place a test order from your phone</li>
        </ol>
      </div>
    </main>
  );
}
