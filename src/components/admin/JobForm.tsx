import { saveJobAction } from "@/app/admin/jobs/actions";
import { JobLocationFields } from "@/components/admin/JobLocationFields";
import {
  defaultJobExpiryDate,
  EMPLOYMENT_TYPES,
  JOB_CATEGORIES,
  SALARY_TYPES,
  type Job
} from "@/lib/jobs";

const inputClass = "focus-ring mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm";
const labelClass = "block text-sm font-bold text-stone-700";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
      <legend className="px-2 text-lg font-black text-ink">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Checkbox({ name, label, defaultChecked = false }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-stone-200 p-3 text-sm font-bold text-stone-700">
      <input className="mt-0.5 size-4 accent-leaf" defaultChecked={defaultChecked} name={name} type="checkbox" />
      {label}
    </label>
  );
}

export function JobForm({
  job,
  restaurantName,
  defaultWhatsApp,
  error
}: {
  job?: Job | null;
  restaurantName: string;
  defaultWhatsApp: string;
  error?: string;
}) {
  const returnTo = job ? `/admin/jobs/${job.id}/edit` : "/admin/jobs/new";
  return (
    <form action={saveJobAction} className="space-y-5">
      <input name="job_id" type="hidden" value={job?.id ?? ""} />
      <input name="return_to" type="hidden" value={returnTo} />
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p> : null}

      <Section title="1. Role">
        <label className={labelClass}>Job title
          <input className={inputClass} defaultValue={job?.title} maxLength={100} name="title" placeholder="e.g. Barista" required />
        </label>
        <label className={labelClass}>Category
          <select className={inputClass} defaultValue={job?.category ?? ""} name="category" required>
            <option disabled value="">Select category</option>
            {JOB_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>
        <label className={labelClass}>Employment type
          <select className={inputClass} defaultValue={job?.employment_type ?? "Full-time"} name="employment_type">
            {EMPLOYMENT_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label className={labelClass}>Number of vacancies
          <input className={inputClass} defaultValue={job?.number_of_vacancies ?? 1} max={100} min={1} name="number_of_vacancies" required type="number" />
        </label>
      </Section>

      <Section title="2. Location">
        <JobLocationFields initialCity={job?.city ?? "Dubai"} initialEmirate={job?.emirate ?? "Dubai"} />
        <label className={`${labelClass} sm:col-span-2`}>Approximate location
          <input className={inputClass} defaultValue={job?.approximate_location ?? ""} maxLength={160} name="approximate_location" placeholder="e.g. Al Barsha, near Mall of the Emirates" />
        </label>
        <Checkbox defaultChecked={job?.show_restaurant_name ?? true} label={`Show restaurant name (${restaurantName})`} name="show_restaurant_name" />
        <Checkbox defaultChecked={job?.show_exact_location ?? false} label="Show the restaurant address on the public job" name="show_exact_location" />
      </Section>

      <Section title="3. Salary and benefits">
        <label className={labelClass}>Salary type
          <select className={inputClass} defaultValue={job?.salary_type ?? "Negotiable"} name="salary_type">
            {SALARY_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label className={labelClass}>Currency
          <input className={`${inputClass} bg-stone-100`} disabled value="AED" />
        </label>
        <label className={labelClass}>Minimum / fixed monthly salary
          <input className={inputClass} defaultValue={job?.salary_min ?? ""} min={0} name="salary_min" placeholder="2500" step="0.01" type="number" />
        </label>
        <label className={labelClass}>Maximum salary (for range)
          <input className={inputClass} defaultValue={job?.salary_max ?? ""} min={0} name="salary_max" placeholder="3500" step="0.01" type="number" />
        </label>
        <Checkbox defaultChecked={job?.accommodation_provided} label="Accommodation provided" name="accommodation_provided" />
        <Checkbox defaultChecked={job?.food_provided} label="Food provided" name="food_provided" />
        <Checkbox defaultChecked={job?.visa_provided} label="Visa provided" name="visa_provided" />
        <Checkbox defaultChecked={job?.immediate_joining} label="Immediate joining" name="immediate_joining" />
      </Section>

      <Section title="4. Requirements">
        <label className={labelClass}>Experience required
          <input className={inputClass} defaultValue={job?.experience_required ?? ""} maxLength={160} name="experience_required" placeholder="e.g. 1 year preferred" />
        </label>
        <label className={labelClass}>Preferred joining date
          <input className={inputClass} defaultValue={job?.preferred_joining_date ?? ""} name="preferred_joining_date" type="date" />
        </label>
        <label className={labelClass}>Working hours
          <input className={inputClass} defaultValue={job?.working_hours ?? ""} maxLength={120} name="working_hours" placeholder="e.g. 10 hours, split shift" />
        </label>
        <label className={labelClass}>Weekly day off
          <input className={inputClass} defaultValue={job?.weekly_day_off ?? ""} maxLength={80} name="weekly_day_off" placeholder="e.g. One day per week" />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>Languages preferred
          <input className={inputClass} defaultValue={job?.preferred_languages.join(", ") ?? ""} name="preferred_languages" placeholder="English, Arabic, Hindi" />
        </label>
        {["description", "responsibilities", "requirements"].map((field) => (
          <label className={`${labelClass} sm:col-span-2`} key={field}>{field[0].toUpperCase() + field.slice(1)}
            <textarea className={inputClass} defaultValue={job?.[field as "description" | "responsibilities" | "requirements"] ?? ""} maxLength={2000} name={field} rows={4} />
          </label>
        ))}
      </Section>

      <Section title="5. Contact and publishing">
        <label className={labelClass}>Application method
          <input className={`${inputClass} bg-stone-100`} disabled value="WhatsApp" />
        </label>
        <label className={labelClass}>Contact WhatsApp number
          <input className={inputClass} defaultValue={job?.contact_whatsapp ?? defaultWhatsApp} inputMode="tel" name="contact_whatsapp" placeholder="+971 50 123 4567" required />
        </label>
        <label className={labelClass}>Expiry date
          <input className={inputClass} defaultValue={job?.expires_at?.slice(0, 10) ?? defaultJobExpiryDate()} name="expires_at" type="date" />
          <span className="mt-1 block text-xs font-normal text-stone-500">Publishing defaults to 30 days. Republish always starts a fresh 30-day period.</span>
        </label>
      </Section>

      <div className="sticky bottom-20 z-10 flex gap-3 rounded-2xl border border-stone-200 bg-white/95 p-3 shadow-soft backdrop-blur lg:bottom-4">
        <button className="focus-ring flex-1 rounded-lg border border-leaf px-4 py-3 font-black text-leaf" name="save_as" type="submit" value="draft">Save draft</button>
        <button className="focus-ring flex-1 rounded-lg bg-leaf px-4 py-3 font-black text-white" name="save_as" type="submit" value="published">Publish</button>
      </div>
    </form>
  );
}
