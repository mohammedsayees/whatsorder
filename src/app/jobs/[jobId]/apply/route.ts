import { NextResponse } from "next/server";
import { recordJobEvent } from "@/app/jobs/actions";
import { buildWhatsAppApplicationUrl } from "@/lib/jobs";
import { getPublicJob } from "@/lib/jobs-data";

async function redirectToWhatsApp(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await getPublicJob(jobId);
  if (!job) return NextResponse.redirect(new URL("/jobs", _request.url), 303);
  await recordJobEvent(job.id, "whatsapp_apply_clicked");
  return NextResponse.redirect(buildWhatsAppApplicationUrl(job), 303);
}

export const GET = redirectToWhatsApp;
export const POST = redirectToWhatsApp;
