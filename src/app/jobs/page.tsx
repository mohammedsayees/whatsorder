import Link from "next/link";
import { BriefcaseBusiness, MapPin } from "lucide-react";
import { formatJobSalary, JOB_CATEGORIES, UAE_LOCATIONS } from "@/lib/jobs";
import { getPublicJobs } from "@/lib/jobs-data";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Hospitality jobs in the UAE | WhatsOrder Jobs",
  description: "Find current café and restaurant jobs across the UAE and apply directly through WhatsApp."
};

function queryUrl(query: Record<string, string | undefined>, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  params.set("page", String(page));
  return `/jobs?${params.toString()}`;
}

export default async function JobsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  const { jobs, total } = await getPublicJobs({
    search: query.q,
    emirate: query.emirate,
    city: query.city,
    category: query.category,
    immediateJoining: query.immediate === "1" ? true : undefined,
    accommodation: query.accommodation === "1" ? true : undefined,
    page,
    pageSize: 12
  });
  const totalPages = Math.max(1, Math.ceil(total / 12));

  return (
    <main className="min-h-screen bg-stone-50 text-ink">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link className="text-xl font-black text-leaf" href="/">WhatsOrder</Link>
          <Link className="text-sm font-bold text-stone-600" href="/admin/jobs">Post a job</Link>
        </div>
      </header>
      <section className="bg-ink px-4 py-10 text-white sm:py-14">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-black uppercase tracking-wider text-saffron">WhatsOrder Jobs</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-black sm:text-5xl">Hospitality jobs across the UAE</h1>
          <p className="mt-3 max-w-xl text-stone-300">Current café and restaurant vacancies. No candidate account—apply directly through WhatsApp.</p>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[17rem_1fr]">
        <form className="h-fit rounded-2xl border border-stone-200 bg-white p-4 shadow-sm" method="get">
          <h2 className="font-black">Find a job</h2>
          <label className="mt-4 block text-sm font-bold">Keyword
            <input className="focus-ring mt-1 w-full rounded-lg border border-stone-300 px-3 py-2.5" defaultValue={query.q} name="q" placeholder="Barista, cashier…" />
          </label>
          <label className="mt-3 block text-sm font-bold">Emirate
            <select className="focus-ring mt-1 w-full rounded-lg border border-stone-300 px-3 py-2.5" defaultValue={query.emirate ?? ""} name="emirate">
              <option value="">All emirates</option>{Object.keys(UAE_LOCATIONS).map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="mt-3 block text-sm font-bold">City
            <select className="focus-ring mt-1 w-full rounded-lg border border-stone-300 px-3 py-2.5" defaultValue={query.city ?? ""} name="city">
              <option value="">All cities</option>{Object.values(UAE_LOCATIONS).flat().map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="mt-3 block text-sm font-bold">Category
            <select className="focus-ring mt-1 w-full rounded-lg border border-stone-300 px-3 py-2.5" defaultValue={query.category ?? ""} name="category">
              <option value="">All categories</option>{JOB_CATEGORIES.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="mt-4 flex items-center gap-2 text-sm font-bold"><input className="size-4 accent-leaf" defaultChecked={query.immediate === "1"} name="immediate" type="checkbox" value="1" /> Immediate joining</label>
          <label className="mt-3 flex items-center gap-2 text-sm font-bold"><input className="size-4 accent-leaf" defaultChecked={query.accommodation === "1"} name="accommodation" type="checkbox" value="1" /> Accommodation provided</label>
          <button className="focus-ring mt-5 w-full rounded-lg bg-leaf px-4 py-3 font-black text-white">Apply filters</button>
          <Link className="mt-3 block text-center text-sm font-bold text-stone-500" href="/jobs">Clear filters</Link>
        </form>

        <section>
          <div className="flex items-end justify-between gap-3"><div><h2 className="text-2xl font-black">Active vacancies</h2><p className="text-sm text-stone-500">{total} job{total === 1 ? "" : "s"} found</p></div></div>
          {jobs.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center"><BriefcaseBusiness className="mx-auto text-stone-400" size={38} /><h3 className="mt-3 text-lg font-black">No matching jobs</h3><p className="mt-1 text-sm text-stone-500">Try clearing one or two filters.</p></div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {jobs.map((job) => (
                <article className="flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" key={job.id}>
                  <div className="flex flex-wrap gap-2 text-xs font-black"><span className="rounded-full bg-mint px-2.5 py-1 text-leaf">{job.category}</span>{job.immediate_joining ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">Immediate joining</span> : null}</div>
                  <h3 className="mt-3 text-xl font-black"><Link href={`/jobs/${job.id}`}>{job.title}</Link></h3>
                  <p className="mt-1 text-sm font-bold text-stone-600">{job.restaurant_name ?? "Restaurant hiring via WhatsOrder"}</p>
                  <p className="mt-3 flex items-center gap-1 text-sm text-stone-600"><MapPin size={15} /> {job.city}, {job.emirate}</p>
                  <p className="mt-2 text-sm font-black text-leaf">{formatJobSalary(job)}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-600">{job.accommodation_provided ? <span>Accommodation</span> : null}{job.food_provided ? <span>• Food</span> : null}{job.visa_provided ? <span>• Visa</span> : null}</div>
                  <p className="mt-3 text-xs text-stone-400">Published {job.published_at ? new Date(job.published_at).toLocaleDateString("en-AE") : "recently"} · {job.employment_type}</p>
                  <div className="mt-auto grid grid-cols-2 gap-2 pt-5"><Link className="focus-ring rounded-lg border border-stone-300 px-3 py-2.5 text-center text-sm font-black" href={`/jobs/${job.id}`}>View details</Link><form action={`/jobs/${job.id}/apply`} method="post"><button className="focus-ring w-full rounded-lg bg-[#25D366] px-3 py-2.5 text-sm font-black text-[#073b24]">Apply</button></form></div>
                </article>
              ))}
            </div>
          )}
          {totalPages > 1 ? <nav className="mt-8 flex items-center justify-center gap-3">{page > 1 ? <Link className="rounded-lg border bg-white px-4 py-2 text-sm font-bold" href={queryUrl(query, page - 1)}>Previous</Link> : null}<span className="text-sm text-stone-500">Page {page} of {totalPages}</span>{page < totalPages ? <Link className="rounded-lg bg-ink px-5 py-2.5 text-sm font-black text-white" href={queryUrl(query, page + 1)}>Load more</Link> : null}</nav> : null}
        </section>
      </div>
      <footer className="border-t border-stone-200 bg-white px-4 py-8 text-center text-xs text-stone-500">WhatsOrder connects employers and candidates. We do not guarantee employment. Independently verify employers and never pay for an interview or job offer.</footer>
    </main>
  );
}
