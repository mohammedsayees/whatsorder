import type { Metadata } from "next";
import Link from "next/link";

import InstantDemoBuilder from "@/components/try/InstantDemoBuilder";

// The build server action runs on this page: reading up to 8 menu pages with
// the AI (4 at a time, with retries) needs more than the default time limit.
export const maxDuration = 120;

export const metadata: Metadata = {
  title: "See your menu live in 2 minutes — WhatsOrder",
  description:
    "Upload a photo of your menu and AI builds your restaurant's WhatsApp ordering page. Free demo, no signup, then a 14-day free trial."
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
          Upload photos of your menu (up to 8 pages). Our AI reads it and builds your restaurant&apos;s own
          WhatsApp ordering page. The demo is free with no signup. Claim it within 7 days to
          keep it and start your 14-day free trial.
        </p>

        <div className="mt-8">
          <InstantDemoBuilder />
        </div>

        <ol className="mt-8 space-y-2 text-sm text-slate-500">
          <li>1. Snap your menu (a phone photo works)</li>
          <li>2. AI reads every item and price, then you check anything it wasn&apos;t sure about</li>
          <li>3. Your store goes live — place a test order from your phone</li>
          <li>4. Claim it with your store link and WhatsApp number to start your free trial</li>
        </ol>
      </div>
    </main>
  );
}
