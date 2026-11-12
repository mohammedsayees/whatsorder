// Owners who go live through instant access are signed in before proving
// they own the email they typed. They get a grace period to confirm it; after
// that the dashboard asks for confirmation before anything else.
export const OWNER_EMAIL_VERIFICATION_GRACE_DAYS = 7;

export type OwnerEmailVerificationState = "verified" | "pending" | "overdue";

export function ownerEmailVerificationDueAt(from = new Date()): Date {
  return new Date(from.getTime() + OWNER_EMAIL_VERIFICATION_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

export function ownerEmailVerificationState(
  restaurant: {
    owner_email_verified_at?: string | null;
    owner_email_verification_due_at?: string | null;
  },
  now = new Date()
): OwnerEmailVerificationState {
  // No due date means the owner came through the email invite (already
  // proven) or was set up by WhatsOrder: nothing to ask.
  if (restaurant.owner_email_verified_at || !restaurant.owner_email_verification_due_at) {
    return "verified";
  }
  const due = new Date(restaurant.owner_email_verification_due_at).getTime();
  return Number.isFinite(due) && due <= now.getTime() ? "overdue" : "pending";
}

export function daysUntil(dateIso: string, now = new Date()): number {
  return Math.max(0, Math.ceil((new Date(dateIso).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}
