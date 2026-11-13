import type { Restaurant, UserRole } from "@/lib/types";

export function isAdminPosPathname(pathname: string) {
  return (
    pathname === "/admin/orders/new" ||
    /^\/admin\/orders\/[^/]+\/add-items$/.test(pathname)
  );
}

export function isGuidedAdminSetup(
  restaurant: Pick<
    Restaurant,
    "activated_at" | "owner_email_verification_due_at" | "jobs_only"
  >,
  role: UserRole | "owner" | "manager"
) {
  return (
    restaurant.jobs_only !== true &&
    role !== "staff" &&
    !restaurant.activated_at &&
    Boolean(restaurant.owner_email_verification_due_at)
  );
}
