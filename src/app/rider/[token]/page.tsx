import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GetTheAppBanner } from "@/components/rider/GetTheAppBanner";
import { NativeLinkListener } from "@/components/rider/NativeLinkListener";
import { RiderJobCard } from "@/components/rider/RiderJobCard";
import { getRiderJob } from "@/lib/rider-job-data";

// Private page opened from the rider's WhatsApp assignment message.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your delivery",
  robots: { index: false, follow: false }
};

export default async function RiderTrackingPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let job: Awaited<ReturnType<typeof getRiderJob>> = null;

  try {
    job = await getRiderJob(token);
  } catch {
    job = null;
  }

  if (!job) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">{job.restaurantName}</p>
      <h1 className="mt-2 text-2xl font-black">Delivery #{job.orderRef}</h1>
      <NativeLinkListener currentToken={token} />
      <GetTheAppBanner token={token} />
      <RiderJobCard job={job} token={token} />
    </main>
  );
}
