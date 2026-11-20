/**
 * Builds the WhatsApp handover message a super admin sends to a restaurant
 * owner: the customer ordering link plus how to get into the dashboard.
 * Pure (no server-only imports) so it can be unit tested.
 */

export type OwnerAccessState = "active" | "invited" | "not_invited";

export type OwnerHandoverInput = {
  restaurantName: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
  storeUrl: string;
  loginUrl: string;
  accessState: OwnerAccessState;
};

export function getOwnerAccessState(membership: {
  accepted_at?: string | null;
  invited_at?: string | null;
} | null | undefined): OwnerAccessState {
  if (membership?.accepted_at) return "active";
  if (membership?.invited_at) return "invited";
  return "not_invited";
}

export function buildOwnerHandoverMessage(input: OwnerHandoverInput) {
  const firstName = input.ownerName?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hi ${firstName}!` : "Hi!";

  const accessLines =
    input.accessState === "active"
      ? [`Your dashboard: ${input.loginUrl}`]
      : input.accessState === "invited"
        ? [
            `Your dashboard: ${input.loginUrl}`,
            `We've emailed an invite${input.ownerEmail ? ` to ${input.ownerEmail}` : ""}. Open it to set your password (check spam if you can't find it).`
          ]
        : [
            `Your dashboard: ${input.loginUrl}`,
            "We'll email you an invite to set your password."
          ];

  return [
    greeting,
    `Your WhatsOrder store for ${input.restaurantName} is ready.`,
    "",
    `Customer ordering link: ${input.storeUrl}`,
    "Share it on WhatsApp, Instagram and Google Maps.",
    "",
    ...accessLines,
    "",
    "In the dashboard, open Share to download your QR code and print table cards."
  ].join("\n");
}

/**
 * wa.me link. With a usable number it opens a chat with the owner; otherwise
 * it opens WhatsApp's contact picker with the message prefilled.
 */
export function buildWhatsAppUrl(message: string, phone?: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^00/, "");
  const target = digits.length >= 8 ? digits : "";
  return `https://wa.me/${target}?text=${encodeURIComponent(message)}`;
}
