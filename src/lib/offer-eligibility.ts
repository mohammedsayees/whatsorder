// lib/offer-eligibility.ts
//
// Which products an offer may be attached to. An offer is shown to customers
// only when its product is on the public menu, and the database hides
// staff-only (POS billing) products from the public — so an offer on one would
// be saved but never appear (menu rail, share message) or be orderable.
// Pure and dependency-free: used by the admin offer form and its server action.

import type { MenuItem } from "@/lib/types";

export const STAFF_ONLY_OFFER_MESSAGE =
  "Staff-only products can't have offers because customers can't see them. Choose a customer-visible product, or change this product's visibility to “Customer menu and staff” first.";

/** True for products customers can see and order (and so can carry an offer). */
export function isOfferEligibleItem(item: Pick<MenuItem, "is_available" | "staff_only">): boolean {
  return item.is_available && item.staff_only !== true;
}
