"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  defaultJobExpiryDate,
  effectiveJobStatus,
  isValidJobStatusTransition,
  JOB_STATUSES,
  validateJobInput,
  type Job,
  type JobStatus
} from "@/lib/jobs";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

const JOB_MANAGEMENT_ROLES = ["restaurant_admin", "owner", "manager"] as const;

function formValues(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

function formError(returnTo: string, message: string): never {
  const safeReturnTo = returnTo.startsWith("/admin/jobs") ? returnTo : "/admin/jobs";
  const separator = safeReturnTo.includes("?") ? "&" : "?";
  redirect(`${safeReturnTo}${separator}error=${encodeURIComponent(message)}`);
}

function unavailable(returnTo: string): never {
  formError(returnTo, "Jobs service is unavailable. Try again later.");
}

export async function saveJobAction(formData: FormData) {
  const session = await requireRestaurantRole([...JOB_MANAGEMENT_ROLES]);
  const admin = getSupabaseAdmin();
  const jobId = String(formData.get("job_id") ?? "").trim();
  const returnTo = String(formData.get("return_to") ?? "/admin/jobs/new");
  const requestedStatus = String(formData.get("save_as") ?? "draft");
  const result = validateJobInput(formValues(formData));

  if (!admin) unavailable(returnTo);
  if ("error" in result) formError(returnTo, result.error);
  if (requestedStatus !== "draft" && requestedStatus !== "published") {
    formError(returnTo, "Invalid publishing choice.");
  }

  const now = new Date();
  const publishFields = requestedStatus === "published"
    ? {
        status: "published" as const,
        published_at: now.toISOString(),
        expires_at:
          result.data.expires_at ??
          new Date(`${defaultJobExpiryDate(now)}T23:59:59.999Z`).toISOString(),
        closed_at: null
      }
    : { status: "draft" as const, published_at: null, closed_at: null };

  if (jobId) {
    const { data: current } = await admin
      .from("jobs")
      .select("id,status,expires_at")
      .eq("id", jobId)
      .eq("restaurant_id", session.restaurantId)
      .maybeSingle();
    if (!current) formError(returnTo, "Job not found.");

    const currentStatus = effectiveJobStatus(current as Pick<Job, "status" | "expires_at">);
    if (!["draft", "unpublished", "published", "rejected"].includes(currentStatus)) {
      formError(returnTo, "This job can no longer be edited.");
    }
    if (
      requestedStatus !== currentStatus &&
      requestedStatus === "published" &&
      !isValidJobStatusTransition(currentStatus, "published")
    ) {
      formError(returnTo, "This job cannot be published from its current status.");
    }

    const keepsCurrentStatus =
      (requestedStatus === "draft" && currentStatus !== "draft") ||
      (requestedStatus === "published" && currentStatus === "published");
    const fields = keepsCurrentStatus
      ? { ...result.data, status: currentStatus }
      : { ...result.data, ...publishFields };
    const { error } = await admin
      .from("jobs")
      .update(fields)
      .eq("id", jobId)
      .eq("restaurant_id", session.restaurantId);
    if (error) formError(returnTo, "The job could not be saved. Check the fields and try again.");
  } else {
    const { error } = await admin.from("jobs").insert({
      ...result.data,
      ...publishFields,
      restaurant_id: session.restaurantId,
      created_by: session.userId,
      application_method: "whatsapp"
    });
    if (error) formError(returnTo, "The job could not be created. Check the fields and try again.");
  }

  revalidatePath("/admin/jobs");
  revalidatePath("/jobs");
  redirect(`/admin/jobs?success=${encodeURIComponent(jobId ? "Job updated." : "Job created.")}`);
}

export async function transitionJobAction(formData: FormData) {
  const session = await requireRestaurantRole([...JOB_MANAGEMENT_ROLES]);
  const admin = getSupabaseAdmin();
  const jobId = String(formData.get("job_id") ?? "");
  const nextStatus = String(formData.get("status") ?? "") as JobStatus;
  if (!admin) unavailable("/admin/jobs");
  if (!JOB_STATUSES.includes(nextStatus)) formError("/admin/jobs", "Invalid job status.");

  const { data: current } = await admin
    .from("jobs")
    .select("id,status,expires_at")
    .eq("id", jobId)
    .eq("restaurant_id", session.restaurantId)
    .maybeSingle();
  if (!current) formError("/admin/jobs", "Job not found.");
  const currentStatus = effectiveJobStatus(current as Pick<Job, "status" | "expires_at">);
  if (!isValidJobStatusTransition(currentStatus, nextStatus)) {
    formError("/admin/jobs", "That status change is not allowed.");
  }

  const now = new Date();
  const fields: Record<string, unknown> = { status: nextStatus };
  if (nextStatus === "published") {
    fields.published_at = now.toISOString();
    fields.expires_at = new Date(`${defaultJobExpiryDate(now)}T23:59:59.999Z`).toISOString();
    fields.closed_at = null;
  }
  if (nextStatus === "closed") fields.closed_at = now.toISOString();

  const { error } = await admin
    .from("jobs")
    .update(fields)
    .eq("id", jobId)
    .eq("restaurant_id", session.restaurantId);
  if (error) formError("/admin/jobs", "The job status could not be changed.");

  revalidatePath("/admin/jobs");
  revalidatePath("/jobs");
  redirect(`/admin/jobs?success=${encodeURIComponent(`Job ${nextStatus}.`)}`);
}

export async function deleteDraftJobAction(formData: FormData) {
  const session = await requireRestaurantRole(["restaurant_admin", "owner"]);
  const admin = getSupabaseAdmin();
  const jobId = String(formData.get("job_id") ?? "");
  if (!admin) unavailable("/admin/jobs");
  const { error, count } = await admin
    .from("jobs")
    .delete({ count: "exact" })
    .eq("id", jobId)
    .eq("restaurant_id", session.restaurantId)
    .eq("status", "draft");
  if (error || count !== 1) formError("/admin/jobs", "Only your restaurant's draft jobs can be deleted.");
  revalidatePath("/admin/jobs");
  redirect(`/admin/jobs?success=${encodeURIComponent("Draft deleted.")}`);
}
