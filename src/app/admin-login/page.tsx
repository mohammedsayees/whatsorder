import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { loginRestaurantAdminAction } from "@/app/admin-login/actions";
import { WhatsAppCodeForm, WhatsAppPhoneForm } from "@/components/admin-login/WhatsAppCodeLogin";
import { WhatsOrderBrand } from "@/components/shared/WhatsOrderBrand";
import { ownerLoginPhoneCookieName } from "@/lib/auth-cookies";
import {
  OWNER_LOGIN_RESEND_COOLDOWN_SECONDS,
  isOwnerWhatsAppCodeEnabled
} from "@/lib/owner-whatsapp-login/config";
import {
  decodeOwnerLoginPhoneCookie,
  resendSecondsLeft
} from "@/lib/owner-whatsapp-login/pending-phone";
import { getRestaurantAdminSession } from "@/lib/super-admin-auth";

export default async function RestaurantAdminLoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; method?: string; wa_error?: string }>;
}) {
  const [session, query, cookieStore] = await Promise.all([
    getRestaurantAdminSession(),
    searchParams,
    cookies()
  ]);

  if (session) {
    redirect("/admin");
  }

  const whatsAppOn = isOwnerWhatsAppCodeEnabled();
  const method = whatsAppOn && query.method !== "email" ? "whatsapp" : "email";
  const pending = whatsAppOn
    ? decodeOwnerLoginPhoneCookie(cookieStore.get(ownerLoginPhoneCookieName)?.value)
    : null;

  const tabClass = (active: boolean) =>
    `flex-1 rounded-md px-3 py-3 text-center text-base font-black ${
      active ? "bg-white text-ink shadow-sm" : "text-stone-500"
    }`;

  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-stone-200 bg-white p-6 shadow-xl sm:p-8">
        <WhatsOrderBrand
          imageClassName="h-12 w-12"
          labelClassName="text-xl font-black text-ink"
        />
        <h1 className="mt-5 text-2xl font-black">Restaurant admin</h1>
        {whatsAppOn ? (
          <nav aria-label="Sign-in method" className="mt-5 flex gap-1 rounded-lg bg-stone-100 p-1">
            <Link aria-current={method === "whatsapp" ? "page" : undefined} className={tabClass(method === "whatsapp")} href="/admin-login">
              WhatsApp
            </Link>
            <Link aria-current={method === "email" ? "page" : undefined} className={tabClass(method === "email")} href="/admin-login?method=email">
              Email
            </Link>
          </nav>
        ) : null}
        {query.error ? (
          <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
            {query.error}
          </p>
        ) : null}

        {method === "whatsapp" ? (
          pending ? (
            <WhatsAppCodeForm
              error={query.wa_error}
              phoneE164={pending.phoneE164}
              resendInSeconds={resendSecondsLeft(pending.requestedAtMs, OWNER_LOGIN_RESEND_COOLDOWN_SECONDS)}
            />
          ) : (
            <WhatsAppPhoneForm error={query.wa_error} />
          )
        ) : (
          <>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Sign in with the account assigned to your WhatsOrder restaurant.
            </p>
            <form action={loginRestaurantAdminAction} className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-bold">Email</span>
                <input className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-4 py-3" name="email" required type="email" />
              </label>
              <label className="block">
                <span className="text-sm font-bold">Password</span>
                <input className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-4 py-3" name="password" required type="password" />
              </label>
              <button className="focus-ring w-full rounded-lg bg-leaf px-5 py-3 font-black text-white" type="submit">
                Sign in
              </button>
            </form>
          </>
        )}
        <p className="mt-5 text-center text-sm text-stone-500">
          Need to hire?{" "}
          <Link className="font-black text-leaf" href="/jobs/post">
            Post a job without subscribing
          </Link>
        </p>
      </section>
    </main>
  );
}
