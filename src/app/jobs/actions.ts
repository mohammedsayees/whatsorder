"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase";
import { JOB_REPORT_REASONS } from "@/lib/jobs";

export type ReportJobState = { error?: string; success?: string };

export async function reportJobAction(
  _previous: ReportJobState,
  formData: FormData
): Promise<ReportJobState> {
  const admin = getSupabaseAdmin();
  if (!admin) return { error: "Reporting is unavailable right now." };
  const jobId = String(formData.get("job_id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const details = String(formData.get("details") ?? "").trim();
  const contact = String(formData.get("reporter_contact") ?? "").trim();
  if (!JOB_REPORT_REASONS.includes(reason as (typeof JOB_REPORT_REASONS)[number])) {
    return { error: "Choose a report reason." };
  }
  if (details.length > 1000 || contact.length > 160) {
    return { error: "The report is too long." };
  }

  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
  const fingerprint = createHash("sha256")
    .update(`${process.env.JOB_REPORT_SALT ?? "whatsorder-job-report"}:${forwarded ?? "unknown"}:${headerStore.get("user-agent") ?? "unknown"}`)
    .digest("hex");
  const { error } = await admin.rpc("report_public_job", {
    requested_details: details,
    requested_fingerprint: fingerprint,
    requested_job_id: jobId,
    requested_reason: reason,
    requested_reporter_contact: contact
  });
  if (error) {
    return {
      error: error.message.includes("Too many reports")
        ? "Too many reports were sent. Please try again later."
        : "The report could not be sent. The job may no longer be active."
    };
  }
  return { success: "Thank you. WhatsOrder will review this listing." };
}

export async function recordJobEvent(jobId: string, eventType: "job_viewed" | "whatsapp_apply_clicked" | "job_shared") {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
  const fingerprint = createHash("sha256")
    .update(`${process.env.JOB_REPORT_SALT ?? "whatsorder-job-event"}:${forwarded ?? "unknown"}:${headerStore.get("user-agent") ?? "unknown"}`)
    .digest("hex");
  await admin.rpc("record_public_job_event", {
    requested_event_type: eventType,
    requested_fingerprint: fingerprint,
    requested_job_id: jobId
  });
}
