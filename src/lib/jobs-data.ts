import "server-only";

import { cache } from "react";
import { getSupabase, getSupabaseAdmin } from "@/lib/supabase";
import { effectiveJobStatus, type Job, type PublicJob } from "@/lib/jobs";

export type AdminJob = Job & { whatsapp_apply_clicks: number };

function coercePublicJob(row: Record<string, unknown>): PublicJob {
  return {
    ...(row as unknown as PublicJob),
    salary_min: row.salary_min === null ? null : Number(row.salary_min),
    salary_max: row.salary_max === null ? null : Number(row.salary_max),
    total_count: Number(row.total_count ?? 0)
  };
}

function coerceJob(row: Record<string, unknown>): Job {
  return {
    ...(row as unknown as Job),
    salary_min: row.salary_min === null ? null : Number(row.salary_min),
    salary_max: row.salary_max === null ? null : Number(row.salary_max),
    number_of_vacancies: Number(row.number_of_vacancies)
  };
}

export async function getRestaurantJobs(restaurantId: string): Promise<AdminJob[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const { data: rows } = await admin
    .from("jobs")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("updated_at", { ascending: false });

  return ((rows ?? []) as Record<string, unknown>[]).map((row) => {
    const job = coerceJob(row);
    return {
      ...job,
      status: effectiveJobStatus(job),
      whatsapp_apply_clicks: Number(row.whatsapp_apply_clicks ?? 0)
    };
  });
}

export async function getRestaurantJob(restaurantId: string, jobId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin
    .from("jobs")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("id", jobId)
    .maybeSingle();
  return data ? coerceJob(data as Record<string, unknown>) : null;
}

export type PublicJobFilters = {
  search?: string;
  emirate?: string;
  city?: string;
  category?: string;
  immediateJoining?: boolean;
  accommodation?: boolean;
  page?: number;
  pageSize?: number;
};

export async function getPublicJobs(filters: PublicJobFilters = {}) {
  const supabase = getSupabase();
  if (!supabase) return { jobs: [], total: 0 };
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(24, Math.max(1, filters.pageSize ?? 12));
  const { data, error } = await supabase.rpc("get_public_jobs", {
    requested_accommodation: filters.accommodation ?? null,
    requested_category: filters.category ?? null,
    requested_city: filters.city ?? null,
    requested_emirate: filters.emirate ?? null,
    requested_immediate_joining: filters.immediateJoining ?? null,
    requested_job_id: null,
    requested_limit: pageSize,
    requested_offset: (page - 1) * pageSize,
    requested_search: filters.search ?? null
  });
  if (error || !Array.isArray(data)) return { jobs: [], total: 0 };
  const jobs = (data as Record<string, unknown>[]).map(coercePublicJob);
  return { jobs, total: jobs[0]?.total_count ?? 0 };
}

export const getPublicJob = cache(async function getPublicJob(jobId: string) {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_public_jobs", {
    requested_accommodation: null,
    requested_category: null,
    requested_city: null,
    requested_emirate: null,
    requested_immediate_joining: null,
    requested_job_id: jobId,
    requested_limit: 1,
    requested_offset: 0,
    requested_search: null
  });
  if (error || !Array.isArray(data) || !data[0]) return null;
  return coercePublicJob(data[0] as Record<string, unknown>);
});
