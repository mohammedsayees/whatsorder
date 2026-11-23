import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CartProvider } from "@/components/customer/CartProvider";
import { CustomerAccountView } from "@/components/customer/CustomerAccount";
import { loadCustomerAccount } from "@/lib/customer-account-data";
import { loadCustomerAddresses } from "@/lib/customer-addresses-data";
import { loadCustomerVouchers } from "@/lib/customer-vouchers-data";
import { loadReferralSummary } from "@/lib/referral-data";
import { getRestaurantBySlug } from "@/lib/data";
import { currentSlugForReleasedSlug } from "@/lib/slug-history";
import { customerSignInNumber, SIGN_IN_KEYWORD } from "@/lib/customer-auth/sign-in-keyword";
import { cloudNumberOwnerSlug } from "@/lib/whatsapp-cloud-tenant";
import { getWhatsAppIntegration } from "@/lib/whatsapp-integration";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

// Per-customer and cookie-driven: never cache or index.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CustomerAccountPage({
  params
}: {
  params: Promise<{ restaurantSlug: string }>;
}) {
  const { restaurantSlug } = await params;
  const restaurant = await getRestaurantBySlug(restaurantSlug);

  if (!restaurant) {
    const currentSlug = await currentSlugForReleasedSlug(restaurantSlug);
    if (currentSlug) {
      redirect(`/r/${currentSlug}/account`);
    }
    notFound();
  }

  const result = await loadCustomerAccount(restaurant.id);
  const identity =
    result.status === "ok" ? { restaurantId: restaurant.id, phone: result.account.phone } : null;
  const [addresses, vouchers, referral] = identity
    ? await Promise.all([
        // An address book needs a customers row (created by the first order).
        result.status === "ok" && result.account.profile
          ? loadCustomerAddresses(identity)
          : Promise.resolve([]),
        loadCustomerVouchers(identity),
        loadReferralSummary(identity)
      ])
    : [[], [], null];

  // "Sign in with WhatsApp" opens a chat, pre-filled with the sign-in
  // keyword, on a number that answers with a link: the café's WhatsApp Web
  // connector, or the shared Cloud number for the café that owns it.
  // Elsewhere, explain instead of offering a dead end.
  const signInNumber =
    result.status === "signed_out"
      ? customerSignInNumber({
          integration: await getWhatsAppIntegration(restaurant.id),
          ownsCloudNumber: restaurant.slug === cloudNumberOwnerSlug(),
          whatsappNumber: restaurant.whatsapp_number
        })
      : null;
  const signInUrl = signInNumber
    ? buildWhatsAppUrl(signInNumber, SIGN_IN_KEYWORD, restaurant.phone_country_code)
    : null;

  return (
    <CartProvider restaurantSlug={restaurant.slug}>
      <CustomerAccountView
        account={result.status === "ok" ? result.account : null}
        addresses={addresses}
        loadFailed={result.status === "error"}
        referral={referral}
        restaurant={restaurant}
        signInUrl={signInUrl}
        vouchers={vouchers}
      />
    </CartProvider>
  );
}
