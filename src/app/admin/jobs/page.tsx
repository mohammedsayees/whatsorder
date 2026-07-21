import Link from "next/link";
import { BriefcaseBusiness, ExternalLink, MessageCircle, Plus } from "lucide-react";
import { CopyJobLinkButton } from "@/components/admin/CopyJobLinkButton";
import { deleteDraftJobAction, transitionJobAction } from "@/app/admin/jobs/actions";
import { formatJobSalary, type JobStatus } from "@/lib/jobs";
import { getRestaurantJobs } from "@/lib/jobs-data";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

export const dynamic = "force-dynamic";

const tabs = [
  { key: "active", label: "Active" },
  { key: "draft", label: "Drafts" },
  { key: "closed", label: "Closed" },
  { key: "expired", label: "Expired" }
] as const;

function statusClass(status: JobStatus) {
  if (status === "published") return "bg-emerald-100 text-emerald-800";
  if (status === "draft") return "bg-stone-200 text-stone-700";
  if (status === "expired") return "bg-amber-100 text-amber-800";
  if (status === "closed") return "bg-red-100 text-red-700";
  return "bg-blue-100 text-blue-700";
}

export default async function AdminJobsPage({
  searchParams
}: {
  searchParams: Promise<{ tab?: string; error?: string; success?: string }>;
}) {
  const [session, query] = await Promise.all([
    requireRestaurantRole(["restaurant_admin", "owner", "manager"], {
      allowJobsOnly: true
    }),
    searchParams
  ]);
  const jobs = await getRestaurantJobs(session.restaurantId);
  const tab = tabs.some((item) => item.key === query.tab) ? query.tab! : "active";
  const visibleJobs = jobs.filter((job) => {
    if (tab === "active") return ["published", "unpublished"].includes(job.status);
    return job.status === tab;
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-leaf">Team</p>
          <h1 className="text-3xl font-black text-ink">Jobs</h1>
          <p className="mt-1 text-sm text-stone-600">Post hospitality openings and receive applications on WhatsApp.</p>
        </div>
        <Link className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-lg bg-leaf px-4 py-3 text-sm font-black text-white" href="/admin/jobs/new">
          <Plus size={18} /> Post a Job
        </Link>
      </div>

      {query.error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{query.error}</p> : null}
      {query.success ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{query.success}</p> : null}

      <nav className="mt-6 flex gap-2 overflow-x-auto border-b border-stone-200 pb-2">
        {tabs.map((item) => {
          const count = jobs.filter((job) => item.key === "active" ? ["published", "unpublished"].includes(job.status) : job.status === item.key).length;
          return (
            <Link className={`focus-ring shrink-0 rounded-full px-4 py-2 text-sm font-black ${tab === item.key ? "bg-ink text-white" : "bg-white text-stone-600"}`} href={`/admin/jobs?tab=${item.key}`} key={item.key}>
              {item.label} <span className="opacity-70">{count}</span>
            </Link>
          );
        })}
      </nav>

      {visibleJobs.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
          <BriefcaseBusiness className="mx-auto text-stone-400" size={36} />
          <h2 className="mt-3 text-lg font-black">No {tab} jobs</h2>
          <p className="mt-1 text-sm text-stone-500">Create a focused listing in a few minutes.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {visibleJobs.map((job) => (
            <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" key={job.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-ink">{job.title}</h2>
                  <p className="mt-1 text-sm text-stone-600">{job.category} · {job.city}, {job.emirate}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-black capitalize ${statusClass(job.status)}`}>{job.status.replace("_", " ")}</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-stone-500">Salary</dt><dd className="font-bold">{formatJobSalary(job)}</dd></div>
                <div><dt className="text-stone-500">Vacancies</dt><dd className="font-bold">{job.number_of_vacancies}</dd></div>
                <div><dt className="text-stone-500">Expiry</dt><dd className="font-bold">{job.expires_at ? new Date(job.expires_at).toLocaleDateString("en-AE") : "Not set"}</dd></div>
                <div><dt className="text-stone-500">WhatsApp clicks</dt><dd className="flex items-center gap-1 font-bold"><MessageCircle size={14} /> {job.whatsapp_apply_clicks}</dd></div>
              </dl>
              <div className="mt-5 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
                {!['closed', 'expired'].includes(job.status) ? <Link className="focus-ring rounded-lg border border-stone-300 px-3 py-2 text-xs font-bold" href={`/admin/jobs/${job.id}/edit`}>Edit</Link> : null}
                {job.status === "draft" || job.status === "unpublished" || job.status === "expired" ? (
                  <form action={transitionJobAction}><input name="job_id" type="hidden" value={job.id} /><button className="focus-ring rounded-lg bg-leaf px-3 py-2 text-xs font-bold text-white" name="status" value="published">{job.status === "expired" ? "Republish 30 days" : "Publish"}</button></form>
                ) : null}
                {job.status === "published" ? (
                  <form action={transitionJobAction}><input name="job_id" type="hidden" value={job.id} /><button className="focus-ring rounded-lg border border-stone-300 px-3 py-2 text-xs font-bold" name="status" value="unpublished">Unpublish</button></form>
                ) : null}
                {["published", "unpublished"].includes(job.status) ? (
                  <form action={transitionJobAction}><input name="job_id" type="hidden" value={job.id} /><button className="focus-ring rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700" name="status" value="closed">Close</button></form>
                ) : null}
                {job.status === "published" ? <><CopyJobLinkButton jobId={job.id} /><Link className="focus-ring inline-flex items-center gap-1 rounded-lg border border-stone-300 px-3 py-2 text-xs font-bold" href={`/jobs/${job.id}`} target="_blank">Open <ExternalLink size={13} /></Link></> : null}
                {job.status === "draft" && ["restaurant_admin", "owner"].includes(session.role) ? (
                  <form action={deleteDraftJobAction}><input name="job_id" type="hidden" value={job.id} /><button className="focus-ring rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700">Delete draft</button></form>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
