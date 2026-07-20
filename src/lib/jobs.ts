export const JOB_CATEGORIES = [
  "Tea Maker",
  "Barista",
  "Shawarma Maker",
  "Burger Cook",
  "Juice Maker",
  "Chef",
  "Kitchen Helper",
  "Waiter",
  "Cashier",
  "Cleaner",
  "Delivery Rider",
  "Restaurant Supervisor",
  "Restaurant Manager",
  "Other"
] as const;

export const EMPLOYMENT_TYPES = [
  "Full-time",
  "Part-time",
  "Temporary",
  "Trial",
  "Contract"
] as const;

export const SALARY_TYPES = [
  "Fixed monthly",
  "Range",
  "Negotiable",
  "Not disclosed"
] as const;

export const JOB_STATUSES = [
  "draft",
  "pending_review",
  "published",
  "unpublished",
  "closed",
  "expired",
  "rejected"
] as const;

export const JOB_REPORT_REASONS = [
  "Fake job",
  "Asking candidates for money",
  "Misleading salary or details",
  "Duplicate listing",
  "Inappropriate content",
  "Job no longer available",
  "Other"
] as const;

export const UAE_LOCATIONS = {
  "Abu Dhabi": ["Abu Dhabi", "Al Ain", "Al Dhafra"],
  Dubai: ["Dubai"],
  Sharjah: ["Sharjah", "Khor Fakkan", "Kalba"],
  Ajman: ["Ajman"],
  "Umm Al Quwain": ["Umm Al Quwain"],
  "Ras Al Khaimah": ["Ras Al Khaimah"],
  Fujairah: ["Fujairah", "Dibba Al Fujairah"]
} as const;

export const UAE_EMIRATES = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Umm Al Quwain",
  "Ras Al Khaimah",
  "Fujairah"
] as const;

export type JobCategory = (typeof JOB_CATEGORIES)[number];
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export type SalaryType = (typeof SALARY_TYPES)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];
export type JobReportReason = (typeof JOB_REPORT_REASONS)[number];
export type Emirate = keyof typeof UAE_LOCATIONS;

export type Job = {
  id: string;
  restaurant_id: string;
  created_by: string | null;
  title: string;
  category: JobCategory;
  employment_type: EmploymentType;
  description: string | null;
  responsibilities: string | null;
  requirements: string | null;
  emirate: Emirate;
  city: string;
  approximate_location: string | null;
  show_restaurant_name: boolean;
  show_exact_location: boolean;
  salary_type: SalaryType;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: "AED";
  number_of_vacancies: number;
  experience_required: string | null;
  immediate_joining: boolean;
  preferred_joining_date: string | null;
  accommodation_provided: boolean;
  food_provided: boolean;
  visa_provided: boolean;
  working_hours: string | null;
  weekly_day_off: string | null;
  preferred_languages: string[];
  contact_whatsapp: string;
  application_method: "whatsapp";
  status: JobStatus;
  published_at: string | null;
  expires_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicJob = Omit<
  Job,
  | "restaurant_id"
  | "created_by"
  | "approximate_location"
  | "show_restaurant_name"
  | "show_exact_location"
  | "application_method"
  | "status"
  | "closed_at"
  | "created_at"
  | "updated_at"
> & {
  location: string | null;
  restaurant_name: string | null;
  total_count: number;
};

export type JobInput = Omit<
  Job,
  | "id"
  | "restaurant_id"
  | "created_by"
  | "status"
  | "published_at"
  | "closed_at"
  | "created_at"
  | "updated_at"
  | "application_method"
>;

const managementTransitions: Record<JobStatus, JobStatus[]> = {
  draft: ["published"],
  pending_review: ["draft", "published", "rejected"],
  published: ["unpublished", "closed"],
  unpublished: ["published", "closed"],
  closed: [],
  expired: ["published"],
  rejected: ["draft"]
};

export function effectiveJobStatus(job: Pick<Job, "status" | "expires_at">, now = new Date()) {
  if (
    job.status === "published" &&
    job.expires_at &&
    new Date(job.expires_at).getTime() <= now.getTime()
  ) {
    return "expired" as const;
  }
  return job.status;
}

export function isValidJobStatusTransition(from: JobStatus, to: JobStatus) {
  return managementTransitions[from].includes(to);
}

export function normalizeWhatsAppNumber(value: string) {
  let digits = value.trim().replace(/^00/, "").replace(/\D/g, "");
  if (/^0?5\d{8}$/.test(digits)) {
    digits = `971${digits.replace(/^0/, "")}`;
  }
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

function cleanText(value: unknown, max: number) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

function numericValue(value: unknown) {
  const raw = String(value ?? "").trim();
  const number = Number(raw);
  return raw && Number.isFinite(number) ? number : null;
}

function isOneOf<T extends readonly string[]>(value: string, values: T): value is T[number] {
  return values.includes(value as T[number]);
}

export function validateJobInput(
  values: Record<string, unknown>,
  now = new Date()
): { data: JobInput } | { error: string } {
  const title = cleanText(values.title, 100);
  const category = String(values.category ?? "");
  const employmentType = String(values.employment_type ?? "");
  const emirate = String(values.emirate ?? "");
  const city = String(values.city ?? "").trim();
  const salaryType = String(values.salary_type ?? "");
  const salaryMin = numericValue(values.salary_min);
  const salaryMax = numericValue(values.salary_max);
  const vacancies = Number(values.number_of_vacancies);
  const contactWhatsApp = normalizeWhatsAppNumber(String(values.contact_whatsapp ?? ""));
  const expiresRaw = String(values.expires_at ?? "").trim();
  const expiresAt = expiresRaw ? new Date(`${expiresRaw}T23:59:59.999Z`) : null;

  if (!title || title.length < 3) return { error: "Enter a job title of at least 3 characters." };
  if (!isOneOf(category, JOB_CATEGORIES)) return { error: "Choose a valid job category." };
  if (!isOneOf(employmentType, EMPLOYMENT_TYPES)) return { error: "Choose a valid employment type." };
  if (!isOneOf(emirate, UAE_EMIRATES)) return { error: "Choose a valid emirate." };
  if (!city || !(UAE_LOCATIONS[emirate] as readonly string[]).includes(city)) {
    return { error: "Choose a valid city for the selected emirate." };
  }
  if (!isOneOf(salaryType, SALARY_TYPES)) return { error: "Choose a valid salary type." };
  if ((salaryMin !== null && salaryMin < 0) || (salaryMax !== null && salaryMax < 0)) {
    return { error: "Salary cannot be negative." };
  }
  if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
    return { error: "Minimum salary cannot exceed maximum salary." };
  }
  if (salaryType === "Fixed monthly" && salaryMin === null) {
    return { error: "Enter the fixed monthly salary." };
  }
  if (salaryType === "Range" && (salaryMin === null || salaryMax === null)) {
    return { error: "Enter both the minimum and maximum salary." };
  }
  if (!Number.isInteger(vacancies) || vacancies < 1 || vacancies > 100) {
    return { error: "Vacancies must be a whole number between 1 and 100." };
  }
  if (!contactWhatsApp) return { error: "Enter a valid UAE or international WhatsApp number." };
  if (expiresRaw && (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt <= now)) {
    return { error: "Expiry date must be in the future." };
  }

  const languages = String(values.preferred_languages ?? "")
    .split(",")
    .map((language) => language.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 10);

  return {
    data: {
      title,
      category,
      employment_type: employmentType,
      description: cleanText(values.description, 2000),
      responsibilities: cleanText(values.responsibilities, 2000),
      requirements: cleanText(values.requirements, 2000),
      emirate,
      city,
      approximate_location: cleanText(values.approximate_location, 160),
      show_restaurant_name: values.show_restaurant_name === true || values.show_restaurant_name === "on",
      show_exact_location: values.show_exact_location === true || values.show_exact_location === "on",
      salary_type: salaryType,
      salary_min: salaryType === "Negotiable" || salaryType === "Not disclosed" ? null : salaryMin,
      salary_max: salaryType === "Range" ? salaryMax : null,
      salary_currency: "AED",
      number_of_vacancies: vacancies,
      experience_required: cleanText(values.experience_required, 160),
      immediate_joining: values.immediate_joining === true || values.immediate_joining === "on",
      preferred_joining_date: cleanText(values.preferred_joining_date, 10),
      accommodation_provided: values.accommodation_provided === true || values.accommodation_provided === "on",
      food_provided: values.food_provided === true || values.food_provided === "on",
      visa_provided: values.visa_provided === true || values.visa_provided === "on",
      working_hours: cleanText(values.working_hours, 120),
      weekly_day_off: cleanText(values.weekly_day_off, 80),
      preferred_languages: languages,
      contact_whatsapp: contactWhatsApp,
      expires_at: expiresAt?.toISOString() ?? null
    }
  };
}

export function formatJobSalary(job: Pick<Job, "salary_type" | "salary_min" | "salary_max" | "salary_currency">) {
  const money = (amount: number) => `${job.salary_currency} ${Number(amount).toLocaleString("en-AE")}`;
  if (job.salary_type === "Negotiable") return "Negotiable";
  if (job.salary_type === "Not disclosed") return "Salary not disclosed";
  if (job.salary_type === "Range" && job.salary_min !== null && job.salary_max !== null) {
    return `${money(job.salary_min)}–${Number(job.salary_max).toLocaleString("en-AE")} / month`;
  }
  return job.salary_min !== null ? `${money(job.salary_min)} / month` : "Salary not disclosed";
}

export function buildWhatsAppApplicationUrl(job: Pick<PublicJob, "title" | "restaurant_name" | "contact_whatsapp">) {
  const employer = job.restaurant_name ?? "the restaurant";
  const message = `Hello, I am interested in the ${job.title} position at ${employer} listed on WhatsOrder.\n\nName:\nCurrent location:\nExperience:\nVisa status:\nAvailability:`;
  return `https://wa.me/${job.contact_whatsapp}?text=${encodeURIComponent(message)}`;
}

export function defaultJobExpiryDate(now = new Date()) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString().slice(0, 10);
}
