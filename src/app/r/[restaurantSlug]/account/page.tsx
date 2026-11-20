import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CartProvider } from "@/components/customer/CartProvider";
import { CustomerAccountView } from "@/components/customer/CustomerAccount";
import { loadCustomerAccount } from "@/lib/customer-account-data";
import { loadCustomerAddresses } from "@/lib/customer-addresses-data";
import { loadCustomerVouchers } from "@/lib/customer-vouchers-data";
import { getRestaurantBySlug } from "@/lib/data";
import { currentSlugForReleasedSlug } from "@/lib/slug-history";
import { cloudNumberOwnerSlug } from "@/lib/whatsapp-cloud-tenant";
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
  const [addresses, vouchers] = identity
    ? await Promise.all([
        // An address book needs a customers row (created by the first order).
        result.status === "ok" && result.account.profile
          ? loadCustomerAddresses(identity)
          : Promise.resolve([]),
        loadCustomerVouchers(identity)
      ])
    : [[], []];

  // Sign-in links are sent by the WhatsApp Cloud number, which today answers
  // for one café only. Elsewhere, explain instead of offering a dead end.
  const signInUrl =
    result.status === "signed_out" &&
    restaurant.slug === cloudNumberOwnerSlug() &&
    restaurant.whatsapp_number
      ? buildWhatsAppUrl(restaurant.whatsapp_number, "Hi", restaurant.phone_country_code)
      : null;

  return (
    <CartProvider restaurantSlug={restaurant.slug}>
      <CustomerAccountView
        account={result.status === "ok" ? result.account : null}
        addresses={addresses}
        loadFailed={result.status === "error"}
        restaurant={restaurant}
        signInUrl={signInUrl}
        vouchers={vouchers}
      />
    </CartProvider>
  );
}
