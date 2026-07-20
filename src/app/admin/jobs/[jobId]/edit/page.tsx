import Link from "next/link";
import { notFound } from "next/navigation";
import { JobForm } from "@/components/admin/JobForm";
import { getRestaurantJob } from "@/lib/jobs-data";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

export default async function EditJobPage({
  params,
  searchParams
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [session, route, query] = await Promise.all([
    requireRestaurantRole(["restaurant_admin", "owner", "manager"]), params, searchParams
  ]);
  const job = await getRestaurantJob(session.restaurantId, route.jobId);
  if (!job) notFound();
  return (
    <main className="mx-auto max-w-4xl px-4 py-6 lg:px-8">
      <Link className="text-sm font-bold text-leaf" href="/admin/jobs">← Back to jobs</Link>
      <h1 className="mt-3 text-3xl font-black">Edit job</h1>
      <p className="mt-1 text-sm text-stone-600">Changes are tenant-scoped and validated on the server.</p>
      <div className="mt-6"><JobForm defaultWhatsApp={session.restaurant.whatsapp_number} error={query.error} job={job} restaurantName={session.restaurant.name} /></div>
    </main>
  );
}
