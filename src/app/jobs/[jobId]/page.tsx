import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { JobActions } from "@/components/jobs/JobActions";
import { formatJobSalary } from "@/lib/jobs";
import { getPublicJob } from "@/lib/jobs-data";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ jobId: string }> }): Promise<Metadata> {
  const { jobId } = await params;
  const job = await getPublicJob(jobId);
  if (!job) return { title: "Job not found | WhatsOrder Jobs" };
  return {
    title: `${job.title} in ${job.city} | WhatsOrder Jobs`,
    description: `${job.employment_type} ${job.title} vacancy in ${job.city}, ${job.emirate}. Apply through WhatsApp.`
  };
}

function TextSection({ title, value }: { title: string; value: string | null }) {
  if (!value) return null;
  return <section className="border-t border-stone-200 pt-6"><h2 className="text-xl font-black">{title}</h2><p className="mt-3 whitespace-pre-line text-sm leading-7 text-stone-700">{value}</p></section>;
}

export default async function JobDetailsPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await getPublicJob(jobId);
  if (!job) notFound();
  const benefits = [
    job.accommodation_provided ? "Accommodation provided" : null,
    job.food_provided ? "Food provided" : null,
    job.visa_provided ? "Visa provided" : null,
    job.immediate_joining ? "Immediate joining" : null
  ].filter(Boolean) as string[];
  const hasBenefitsOrTiming = benefits.length > 0 || job.weekly_day_off || job.preferred_joining_date;

  return (
    <main className="min-h-screen bg-stone-50 text-ink">
      <header className="border-b border-stone-200 bg-white"><div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4"><Link className="text-xl font-black text-leaf" href="/">WhatsOrder</Link><Link className="text-sm font-bold text-stone-600" href="/jobs">Browse jobs</Link></div></header>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
        <Link className="text-sm font-bold text-leaf" href="/jobs">← Back to all jobs</Link>
        <article className="mt-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="flex flex-wrap gap-2 text-xs font-black"><span className="rounded-full bg-mint px-3 py-1.5 text-leaf">{job.category}</span><span className="rounded-full bg-stone-100 px-3 py-1.5 text-stone-700">{job.employment_type}</span>{job.immediate_joining ? <span className="rounded-full bg-amber-100 px-3 py-1.5 text-amber-800">Immediate joining</span> : null}</div>
          <h1 className="mt-4 text-3xl font-black sm:text-4xl">{job.title}</h1>
          <p className="mt-2 font-bold text-stone-600">{job.restaurant_name ?? "Restaurant hiring via WhatsOrder"}</p>
          <div className="mt-5 grid gap-3 rounded-xl bg-stone-50 p-4 text-sm sm:grid-cols-2">
            <p className="flex items-center gap-2"><MapPin className="text-leaf" size={17} /> {job.location ? `${job.location}, ` : ""}{job.city}, {job.emirate}</p>
            <p className="font-black text-leaf">{formatJobSalary(job)}</p>
            <p className="flex items-center gap-2"><Users className="text-leaf" size={17} /> {job.number_of_vacancies} {job.number_of_vacancies === 1 ? "vacancy" : "vacancies"}</p>
            <p className="flex items-center gap-2"><CalendarDays className="text-leaf" size={17} /> Apply by {job.expires_at ? new Date(job.expires_at).toLocaleDateString("en-AE", { dateStyle: "medium" }) : "soon"}</p>
            {job.experience_required ? <p className="flex items-center gap-2"><Clock className="text-leaf" size={17} /> {job.experience_required}</p> : null}
            {job.working_hours ? <p className="flex items-center gap-2"><Clock className="text-leaf" size={17} /> {job.working_hours}</p> : null}
          </div>

          {hasBenefitsOrTiming ? <section className="mt-6"><h2 className="text-xl font-black">Benefits and timing</h2>{benefits.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{benefits.map((benefit) => <span className="rounded-full bg-mint px-3 py-2 text-sm font-bold text-leaf" key={benefit}>{benefit}</span>)}</div> : null}{job.weekly_day_off ? <p className="mt-3 text-sm text-stone-700">Weekly day off: {job.weekly_day_off}</p> : null}{job.preferred_joining_date ? <p className="mt-1 text-sm text-stone-700">Preferred joining date: {new Date(`${job.preferred_joining_date}T00:00:00Z`).toLocaleDateString("en-AE")}</p> : null}</section> : null}

          <div className="mt-7 space-y-6"><TextSection title="About the job" value={job.description} /><TextSection title="Responsibilities" value={job.responsibilities} /><TextSection title="Requirements" value={job.requirements} />{job.preferred_languages.length ? <section className="border-t border-stone-200 pt-6"><h2 className="text-xl font-black">Languages preferred</h2><p className="mt-2 text-sm text-stone-700">{job.preferred_languages.join(", ")}</p></section> : null}</div>

          <div className="mt-8 border-t border-stone-200 pt-6"><JobActions jobId={job.id} title={`${job.title} in ${job.city}`} /></div>
          <aside className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-black">Stay safe while applying</p><p className="mt-1">Never pay an employer or agent for an interview or job offer. Verify the company before sharing documents. Do not send passport copies, Emirates ID, visa documents, or your full home address through this listing.</p></aside>
        </article>
        <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-5 text-stone-500">WhatsOrder connects employers and candidates and does not guarantee employment. Candidates must independently verify employers and job details.</p>
      </div>
    </main>
  );
}
