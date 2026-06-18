import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createRestaurantAction } from "@/app/super-admin/actions";
import { RestaurantForm } from "@/components/super-admin/RestaurantForm";

export default async function NewRestaurantPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <Link className="inline-flex items-center gap-2 text-sm font-black text-stone-600" href="/super-admin/restaurants">
        <ArrowLeft size={17} />
        Restaurants
      </Link>
      <div className="mt-5">
        <p className="text-sm font-black uppercase text-leaf">New account</p>
        <h1 className="mt-1 text-3xl font-black">Create restaurant</h1>
        <p className="mt-2 text-stone-600">
          This creates the restaurant workspace, public menu URL, owner record, and onboarding checklist.
        </p>
      </div>

      {query.error ? (
        <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {query.error}
        </p>
      ) : null}

      <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
        <RestaurantForm action={createRestaurantAction} mode="create" />
      </section>
    </main>
  );
}
