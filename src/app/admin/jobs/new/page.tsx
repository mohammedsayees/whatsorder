import Link from "next/link";
import { JobForm } from "@/components/admin/JobForm";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [session, query] = await Promise.all([
    requireRestaurantRole(["restaurant_admin", "owner", "manager"]),
    searchParams
  ]);
  return (
    <main className="mx-auto max-w-4xl px-4 py-6 lg:px-8">
      <Link className="text-sm font-bold text-leaf" href="/admin/jobs">← Back to jobs</Link>
      <h1 className="mt-3 text-3xl font-black">Post a Job</h1>
      <p className="mt-1 text-sm text-stone-600">Structured details help candidates decide quickly on mobile.</p>
      <div className="mt-6"><JobForm defaultWhatsApp={session.restaurant.whatsapp_number} error={query.error} restaurantName={session.restaurant.name} /></div>
    </main>
  );
}
