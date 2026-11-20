import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StampClaim } from "@/components/customer/StampClaim";
import { resolveCustomerSession } from "@/lib/customer-auth/session";
import { customerSignInNumber, SIGN_IN_KEYWORD } from "@/lib/customer-auth/sign-in-keyword";
import { verifyStampClaimToken } from "@/lib/customer-auth/stamp-claim";
import { getRestaurantBySlug } from "@/lib/data";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { cloudNumberOwnerSlug } from "@/lib/whatsapp-cloud-tenant";
import { getWhatsAppIntegration } from "@/lib/whatsapp-integration";

// "Scan to collect your stamp" from a counter receipt. Per-customer: never
// cache or index.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function StampClaimPage({
  params,
  searchParams
}: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const [{ restaurantSlug }, query] = await Promise.all([params, searchParams]);
  const restaurant = await getRestaurantBySlug(restaurantSlug);
  if (!restaurant) {
    notFound();
  }

  const rawToken = typeof query.t === "string" ? query.t : "";
  const claim = await verifyStampClaimToken(rawToken);
  const token = claim && claim.restaurantId === restaurant.id ? rawToken : null;

  const session = await resolveCustomerSession(restaurant.id);
  const signedIn = session.status === "signed_in";
  const signInNumber =
    token && !signedIn
      ? customerSignInNumber({
          integration: await getWhatsAppIntegration(restaurant.id),
          ownsCloudNumber: restaurant.slug === cloudNumberOwnerSlug(),
          whatsappNumber: restaurant.whatsapp_number
        })
      : null;

  return (
    <StampClaim
      restaurantName={restaurant.name}
      restaurantSlug={restaurant.slug}
      signedIn={signedIn}
      signInUrl={
        signInNumber
          ? buildWhatsAppUrl(signInNumber, SIGN_IN_KEYWORD, restaurant.phone_country_code)
          : null
      }
      token={token}
    />
  );
}
