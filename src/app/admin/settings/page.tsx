import Link from "next/link";
import { PosterBrandingForm } from "@/components/admin/PosterBrandingForm";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { BillingSoftBlock } from "@/components/admin/BillingSoftBlock";
import { RiderSettings } from "@/components/admin/RiderSettings";
import { StoreLinkForm } from "@/components/admin/StoreLinkForm";
import { isManagementBlocked } from "@/lib/billing";
import { getTenantAccess } from "@/lib/billing-data";
import { getCountryProfile } from "@/lib/localization";
import { previewPosterPalette } from "@/lib/poster/subjects";
import { getDeliveryRiders } from "@/lib/rider-data";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";
import { OnlinePaymentsSettings, type OnlinePaymentsView } from "@/components/admin/OnlinePaymentsSettings";
import { stripeDashboardUrl, supportsOnlinePayments } from "@/lib/stripe/connect";
import { getRestaurantStripeAccount, syncRestaurantStripeAccount } from "@/lib/stripe/connect-data";
import {
  getDirectRestaurantId,
  getStripePublishableKey,
  isConnectPlatformEnabled,
  isStripeConfigured,
  isStripeLiveMode
} from "@/lib/stripe/server";
import { getOnlinePaymentAccount } from "@/lib/stripe/order-payments";

async function loadOnlinePaymentsView(
  restaurantId: string,
  countryCode: string | null | undefined,
  canManage: boolean
): Promise<OnlinePaymentsView | null> {
  const publishableKey = getStripePublishableKey();

  // Single-café mode: no per-café Stripe onboarding (see DirectPaymentsNotice).
  if (!isStripeConfigured() || !publishableKey || !isConnectPlatformEnabled()) {
    return null;
  }

  let account = await getRestaurantStripeAccount(restaurantId);

  // Until cards are active, re-check with Stripe so the page reflects
  // onboarding progress without waiting for a webhook.
  if (account && account.card_payments_status !== "active") {
    account = await syncRestaurantStripeAccount(restaurantId).catch(() => account);
  }

  return {
    canManage,
    countrySupported: supportsOnlinePayments(countryCode),
    publishableKey,
    testMode: !isStripeLiveMode(),
    account: account
      ? {
          status: account.card_payments_status,
          requirementsDue: account.requirements_due,
          dashboardUrl: stripeDashboardUrl(account.stripe_account_id)
        }
      : null
  };
}

export default async function AdminSettingsPage({
  searchParams
}: {
  searchParams: Promise<{
    slug_saved?: string;
    slug_error?: string;
    branding_saved?: string;
    branding_error?: string;
  }>;
}) {
  const query = await searchParams;
  const session = await requireRestaurantAdmin();
  const restaurant = session.restaurant;

  const canEditPosterBranding = ["owner", "restaurant_admin", "manager"].includes(session.role);
  const canManagePayments = session.role === "owner" || session.role === "restaurant_admin";
  const directPayments =
    session.role !== "staff" && getDirectRestaurantId() === session.restaurantId;
  const [access, riders, posterPalette, onlinePayments, directPaymentsLive] = await Promise.all([
    getTenantAccess(session.restaurantId),
    getDeliveryRiders(session.restaurantId),
    canEditPosterBranding ? previewPosterPalette(restaurant) : Promise.resolve(null),
    session.role !== "staff"
      ? loadOnlinePaymentsView(session.restaurantId, restaurant.country_code, canManagePayments)
      : Promise.resolve(null),
    directPayments ? getOnlinePaymentAccount(restaurant).then(Boolean).catch(() => false) : Promise.resolve(false)
  ]);
  if (isManagementBlocked(access.access)) {
    return <BillingSoftBlock surface="Restaurant settings" />;
  }

  const canWrite = Boolean(getSupabaseAdmin()) && session.role !== "staff";
  const canEditLoyalty = session.role === "owner" || session.role === "restaurant_admin";
  const canEditStoreLink = canEditLoyalty;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-black">Restaurant settings</h1>
      <p className="mt-2 text-stone-600">
        Configure public menu details and the WhatsApp number used for click-to-order.
      </p>
      {!canWrite ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          Demo mode is read-only. Connect Supabase in .env.local to save settings.
        </p>
      ) : null}
      {canEditStoreLink ? (
        <div className="mt-6">
          <StoreLinkForm
            canWrite={canWrite}
            error={query.slug_error ? String(query.slug_error).slice(0, 200) : null}
            saved={query.slug_saved === "1"}
            slug={restaurant.slug}
          />
        </div>
      ) : null}
      <div className="mt-6">
        <SettingsForm restaurant={restaurant} canWrite={canWrite} />
      </div>
      {onlinePayments ? (
        <div className="mt-6">
          <OnlinePaymentsSettings view={onlinePayments} />
        </div>
      ) : null}
      {directPayments ? (
        <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black">Online payments</h2>
          {directPaymentsLive ? (
            <p className="mt-2 text-sm text-stone-600">
              <span className="font-bold text-leaf">On.</span> Customers can choose &ldquo;Pay online&rdquo; at
              checkout. Payments go to {restaurant.name}&apos;s own Stripe account and are paid out to its bank.
              Refunds and payouts are managed in the Stripe Dashboard.
            </p>
          ) : (
            <p className="mt-2 text-sm text-stone-600">
              Connected to {restaurant.name}&apos;s own Stripe account, but not taking payments yet. Check that
              the Stripe account is activated and its webhook is set up.
            </p>
          )}
        </section>
      ) : null}
      {session.role !== "staff" ? (
        <div className="mt-6">
          <RiderSettings
            canWrite={canWrite}
            phoneExample={getCountryProfile(restaurant.country_code).phoneExample}
            riders={riders}
          />
        </div>
      ) : null}
      {canEditLoyalty ? (
        <div className="mt-6">
          <Link
            className="focus-ring inline-flex rounded-lg px-3 py-2 text-sm font-bold text-leaf hover:underline"
            href="/admin/marketing/loyalty"
          >
            Manage loyalty in Marketing
          </Link>
        </div>
      ) : null}
      {canEditPosterBranding && posterPalette ? (
        <div className="mt-6">
          <PosterBrandingForm
            brandColor={restaurant.poster_brand_color ?? null}
            canWrite={canWrite}
            failed={query.branding_error === "1"}
            preview={posterPalette}
            saved={query.branding_saved === "1"}
            theme={restaurant.poster_theme ?? null}
          />
        </div>
      ) : null}
    </main>
  );
}
