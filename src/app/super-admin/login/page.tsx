import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { loginSuperAdminAction } from "@/app/super-admin/actions";
import { getSuperAdminSession } from "@/lib/super-admin-auth";

export default async function SuperAdminLoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [session, query] = await Promise.all([getSuperAdminSession(), searchParams]);

  if (session) {
    redirect("/super-admin");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#173d2f] px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-white p-6 shadow-2xl sm:p-8">
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-mint text-leaf">
          <ShieldCheck size={24} />
        </div>
        <h1 className="mt-5 text-2xl font-black">WhatsOrder Super Admin</h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Sign in with a Supabase Auth account whose profile role is set to{" "}
          <strong>super_admin</strong>.
        </p>

        {query.error ? (
          <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
            {query.error}
          </p>
        ) : null}

        <form action={loginSuperAdminAction} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-bold">Email</span>
            <input
              autoComplete="email"
              className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-4 py-3"
              name="email"
              required
              type="email"
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold">Password</span>
            <input
              autoComplete="current-password"
              className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-4 py-3"
              name="password"
              required
              type="password"
            />
          </label>
          <button className="focus-ring w-full rounded-lg bg-leaf px-5 py-3 font-black text-white" type="submit">
            Sign in securely
          </button>
        </form>
      </section>
    </main>
  );
}
