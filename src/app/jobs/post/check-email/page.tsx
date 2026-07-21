import Link from "next/link";
import { MailCheck } from "lucide-react";

export const metadata = { title: "Check your email | WhatsOrder Jobs" };

export default function CheckEmployerEmailPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-stone-50 px-4 py-10 text-ink">
      <section className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-7 text-center shadow-sm sm:p-10">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-mint text-leaf">
          <MailCheck size={28} />
        </div>
        <h1 className="mt-5 text-3xl font-black">Check your email</h1>
        <p className="mt-3 leading-7 text-stone-600">
          Open the WhatsOrder activation email, confirm your account, and create a password. We’ll
          take you straight to your first job listing.
        </p>
        <p className="mt-4 text-sm text-stone-500">If it is not in your inbox, check spam or junk.</p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link className="focus-ring rounded-lg bg-leaf px-5 py-3 font-black text-white" href="/admin-login">
            Employer sign in
          </Link>
          <Link className="focus-ring rounded-lg border border-stone-300 px-5 py-3 font-black" href="/jobs">
            Browse jobs
          </Link>
        </div>
      </section>
    </main>
  );
}
