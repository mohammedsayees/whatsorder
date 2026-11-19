// Pure Stripe Connect rules shared by the server layer and admin UI.

export type CardPaymentsStatus = "active" | "pending" | "restricted" | "unsupported";

const STATUSES: readonly CardPaymentsStatus[] = ["active", "pending", "restricted", "unsupported"];

/** Countries where restaurants can take online payments on our UAE platform. */
export const ONLINE_PAYMENT_COUNTRIES = ["AE"] as const;

export function supportsOnlinePayments(countryCode: string | null | undefined) {
  return (ONLINE_PAYMENT_COUNTRIES as readonly string[]).includes(String(countryCode ?? "").toUpperCase());
}

type V2AccountLike = {
  configuration?: {
    merchant?: { capabilities?: { card_payments?: { status?: string | null } | null } | null } | null;
  } | null;
  requirements?: {
    summary?: { minimum_deadline?: { status?: string | null } | null } | null;
  } | null;
};

/** configuration.merchant.capabilities.card_payments.status, normalised. */
export function cardPaymentsStatusOf(account: V2AccountLike): CardPaymentsStatus {
  const status = account.configuration?.merchant?.capabilities?.card_payments?.status;
  return status && (STATUSES as readonly string[]).includes(status) ? (status as CardPaymentsStatus) : "pending";
}

/** True while Stripe needs the restaurant to provide or fix information. */
export function requirementsDueOf(account: V2AccountLike) {
  const deadline = account.requirements?.summary?.minimum_deadline?.status;
  return deadline === "currently_due" || deadline === "past_due";
}

/** Online payments may be offered only once Stripe has activated cards. */
export function canAcceptOnlinePayments(account: { card_payments_status: CardPaymentsStatus } | null) {
  return account?.card_payments_status === "active";
}

/** Where a restaurant manages payouts and refunds (full Stripe Dashboard). */
export function stripeDashboardUrl(stripeAccountId: string) {
  return `https://dashboard.stripe.com/${encodeURIComponent(stripeAccountId)}`;
}
