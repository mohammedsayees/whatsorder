import { NextResponse } from "next/server";
import { recordJobEvent } from "@/app/jobs/actions";

const allowedEvents = ["job_viewed", "job_shared"] as const;

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const body = await request.json().catch(() => null) as { eventType?: string } | null;
  if (!body || !allowedEvents.includes(body.eventType as (typeof allowedEvents)[number])) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }
  await recordJobEvent(jobId, body.eventType as (typeof allowedEvents)[number]);
  return new NextResponse(null, { status: 204 });
}
