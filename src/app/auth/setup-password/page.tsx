import { LockKeyhole } from "lucide-react";
import { setRestaurantOwnerPasswordAction } from "@/app/auth/invite/actions";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

export default async function SetRestaurantPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [session, query] = await Promise.all([
    requireRestaurantAdmin({ allowJobsOnly: true }),
    searchParams
  ]);

  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-stone-200 bg-white p-7 shadow-xl">
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-mint text-leaf">
          <LockKeyhole size={23} />
        </div>
        <h1 className="mt-5 text-2xl font-black">Create your password</h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Activate access for <strong>{session.restaurant.name}</strong>. You will use this password
          with {session.email} at the employer login.
        </p>
        {query.error ? (
          <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
            {query.error}
          </p>
        ) : null}
        <form action={setRestaurantOwnerPasswordAction} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-bold">Password</span>
            <input
              autoComplete="new-password"
              className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-4 py-3"
              minLength={12}
              name="password"
              required
              type="password"
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold">Confirm password</span>
            <input
              autoComplete="new-password"
              className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-4 py-3"
              minLength={12}
              name="confirm_password"
              required
              type="password"
            />
          </label>
          <button className="focus-ring w-full rounded-lg bg-leaf px-5 py-3 font-black text-white" type="submit">
            {session.restaurant.jobs_only ? "Activate employer account" : "Activate restaurant account"}
          </button>
        </form>
      </section>
    </main>
  );
}
