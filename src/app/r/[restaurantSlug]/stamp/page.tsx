import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StampClaim } from "@/components/customer/StampClaim";
import { resolveCustomerSession } from "@/lib/customer-auth/session";
import { customerSignInNumber, signInMessageWithStamp } from "@/lib/customer-auth/sign-in-keyword";
import { inspectStampClaimToken } from "@/lib/customer-auth/stamp-claim";
import { mintStampClaimCode } from "@/lib/customer-auth/stamp-claim-code";
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
  const inspected = await inspectStampClaimToken(rawToken);
  const valid = inspected.status === "valid" && inspected.claim.restaurantId === restaurant.id;
  const token = valid ? rawToken : null;
  // Genuine receipt from this café, just older than 24 hours: say so, rather
  // than calling the link broken.
  const expired = inspected.status === "expired" && inspected.restaurantId === restaurant.id;

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
  // The receipt rides in the sign-in message, so the stamp is added the
  // moment WhatsApp delivers it, whichever browser opens the reply link.
  const stampCode =
    signInNumber && inspected.status === "valid"
      ? mintStampClaimCode(inspected.claim, inspected.expiresAt)
      : null;

  return (
    <StampClaim
      expired={expired}
      logoUrl={restaurant.logo_url}
      restaurantName={restaurant.name}
      restaurantNameAr={restaurant.name_ar ?? null}
      restaurantSlug={restaurant.slug}
      signedIn={signedIn}
      signInUrl={
        signInNumber
          ? buildWhatsAppUrl(signInNumber, signInMessageWithStamp(stampCode), restaurant.phone_country_code)
          : null
      }
      token={token}
    />
  );
}
