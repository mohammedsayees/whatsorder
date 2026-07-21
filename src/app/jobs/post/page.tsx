import Link from "next/link";
import { BadgeCheck, BriefcaseBusiness, MailCheck } from "lucide-react";
import { createJobsEmployerAccountAction } from "@/app/jobs/post/actions";
import { UAE_LOCATIONS } from "@/lib/jobs";

export const metadata = {
  title: "Post a hospitality job free | WhatsOrder Jobs",
  description:
    "Create a UAE restaurant or café employer account and post jobs without a WhatsOrder subscription."
};

const inputClass =
  "focus-ring mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-3 text-sm";
const labelClass = "block text-sm font-bold text-stone-700";

export default async function PostAJobPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; existing?: string }>;
}) {
  const query = await searchParams;

  return (
    <main className="min-h-screen bg-stone-50 text-ink">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link className="text-xl font-black text-leaf" href="/jobs">
            WhatsOrder Jobs
          </Link>
          <Link className="text-sm font-bold text-stone-600" href="/admin-login">
            Employer sign in
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[0.85fr_1.15fr] lg:py-12">
        <section className="h-fit rounded-2xl bg-ink p-6 text-white sm:p-8">
          <BriefcaseBusiness className="text-saffron" size={36} />
          <p className="mt-6 text-sm font-black uppercase tracking-wider text-saffron">
            Built for UAE hospitality
          </p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">
            Post a job without subscribing
          </h1>
          <p className="mt-4 leading-7 text-stone-300">
            Create a free Jobs-only employer account. Candidates browse without an account and
            apply directly to your WhatsApp.
          </p>
          <ul className="mt-6 space-y-3 text-sm font-bold text-stone-200">
            <li className="flex gap-2"><BadgeCheck className="shrink-0 text-mint" size={20} /> No WhatsOrder subscription or card</li>
            <li className="flex gap-2"><MailCheck className="shrink-0 text-mint" size={20} /> Email activation protects your employer account</li>
            <li className="flex gap-2"><BriefcaseBusiness className="shrink-0 text-mint" size={20} /> Up to three open listings at a time</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8">
          <h2 className="text-2xl font-black">Create your employer account</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            This account includes WhatsOrder Jobs only. You can choose a restaurant subscription
            separately later.
          </p>

          {query.error ? (
            <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {query.error}
            </p>
          ) : null}
          {query.existing ? (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-bold">That email already has a WhatsOrder restaurant account.</p>
              <Link className="mt-1 inline-block font-black underline" href="/admin-login">
                Sign in to post a job
              </Link>
            </div>
          ) : null}

          <form action={createJobsEmployerAccountAction} className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className={`${labelClass} sm:col-span-2`}>
              Restaurant or café name
              <input className={inputClass} maxLength={120} name="restaurant_name" required />
            </label>
            <label className={labelClass}>
              Your full name
              <input autoComplete="name" className={inputClass} maxLength={100} name="contact_name" required />
            </label>
            <label className={labelClass}>
              Work email
              <input autoComplete="email" className={inputClass} maxLength={254} name="email" required type="email" />
            </label>
            <label className={labelClass}>
              WhatsApp number
              <input autoComplete="tel" className={inputClass} inputMode="tel" name="whatsapp_number" placeholder="+971 50 123 4567" required />
            </label>
            <label className={labelClass}>
              Emirate
              <select className={inputClass} defaultValue="" name="emirate" required>
                <option disabled value="">Choose emirate</option>
                {Object.keys(UAE_LOCATIONS).map((emirate) => <option key={emirate}>{emirate}</option>)}
              </select>
            </label>
            <label className={labelClass}>
              City
              <select className={inputClass} defaultValue="" name="city" required>
                <option disabled value="">Choose city</option>
                {Object.values(UAE_LOCATIONS).flat().map((city) => <option key={city}>{city}</option>)}
              </select>
            </label>
            <label className={labelClass}>
              Area (optional)
              <input className={inputClass} maxLength={160} name="address" placeholder="e.g. Al Barsha" />
            </label>

            <div aria-hidden="true" className="absolute -left-[9999px]" tabIndex={-1}>
              <label>Website<input autoComplete="off" name="website" tabIndex={-1} /></label>
            </div>

            <label className="flex items-start gap-3 text-sm leading-6 text-stone-700 sm:col-span-2">
              <input className="mt-1 size-4 shrink-0 accent-leaf" name="authorized" required type="checkbox" />
              I am the restaurant owner, manager, or authorized hiring representative.
            </label>
            <label className="flex items-start gap-3 text-sm leading-6 text-stone-700 sm:col-span-2">
              <input className="mt-1 size-4 shrink-0 accent-leaf" name="terms" required type="checkbox" />
              I will post genuine roles, never charge candidates, and accept the job-listing safety rules.
            </label>

            <button className="focus-ring rounded-lg bg-leaf px-5 py-3.5 font-black text-white sm:col-span-2" type="submit">
              Create free Jobs account
            </button>
          </form>
          <p className="mt-4 text-center text-xs leading-5 text-stone-500">
            We will email an activation link. Your listing is not created until you activate the account.
          </p>
        </section>
      </div>
    </main>
  );
}
