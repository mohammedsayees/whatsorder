import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OwnerEmailBanner } from "@/components/admin/OwnerEmailBanner";
import { ownerEmailVerificationState } from "@/lib/owner-email-verification";
import { getRestaurantAdminSession } from "@/lib/super-admin-auth";

export const metadata: Metadata = { title: "Confirm your email — WhatsOrder" };

// Shown instead of the dashboard once the 7-day grace period for confirming
// the owner email has passed. Outside /admin so the admin layout's gate can
// redirect here without looping.
export default async function ConfirmEmailRequiredPage() {
  const session = await getRestaurantAdminSession();
  if (!session) {
    redirect("/admin-login");
  }
  if (ownerEmailVerificationState(session.restaurant) !== "overdue") {
    redirect("/admin");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 px-4 py-10">
      <section className="w-full max-w-lg rounded-lg border border-stone-200 bg-white p-7 shadow-xl">
        <h1 className="text-2xl font-black">Confirm your email to continue</h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Your store <strong>{session.restaurant.name}</strong> is still taking orders on WhatsApp.
          To open your dashboard again, confirm that you own the email you signed up with.
        </p>
        <div className="mt-5">
          <OwnerEmailBanner blocking daysLeft={0} email={session.restaurant.owner_email ?? session.email} />
        </div>
        <p className="mt-5 text-xs text-stone-500">
          Wrong email address? Message WhatsOrder support on WhatsApp and we&apos;ll fix it.
        </p>
      </section>
    </main>
  );
}
