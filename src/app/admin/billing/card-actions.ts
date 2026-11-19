"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BILLING_ROLES } from "@/lib/owner-billing";
import { requestOrigin } from "@/lib/request-origin";
import {
  BillingCardError,
  createCardSetupUrl,
  createInvoiceCheckoutUrl,
  removeBillingCard,
  setAutopay
} from "@/lib/stripe/billing";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

// Paying WhatsOrder invoices by card (Stripe Checkout on the WhatsOrder
// account) and managing the autopay card. Owner / restaurant admin only;
// every action acts on the session restaurant.

function errorCode(error: unknown) {
  return error instanceof BillingCardError ? error.code : "unavailable";
}

function logFailure(action: string, restaurantId: string, error: unknown) {
  console.error(`WhatsOrder billing card: ${action} failed`, {
    restaurantId,
    message: error instanceof Error ? error.message : "unknown"
  });
}

export async function payInvoiceByCardAction(formData: FormData) {
  const session = await requireRestaurantRole([...BILLING_ROLES]);
  const invoiceId = String(formData.get("invoice_id") ?? "").slice(0, 80);
  let url: string;
  try {
    url = await createInvoiceCheckoutUrl({
      restaurantId: session.restaurantId,
      restaurantName: session.restaurant.name,
      email: session.email || null,
      invoiceId,
      saveCardForAutopay: formData.get("save_card") === "on",
      userId: session.userId,
      origin: await requestOrigin()
    });
  } catch (error) {
    logFailure("pay invoice", session.restaurantId, error);
    redirect(`/admin/billing?card=${errorCode(error)}`);
  }
  redirect(url);
}

export async function addBillingCardAction() {
  const session = await requireRestaurantRole([...BILLING_ROLES]);
  let url: string;
  try {
    url = await createCardSetupUrl({
      restaurantId: session.restaurantId,
      restaurantName: session.restaurant.name,
      email: session.email || null,
      userId: session.userId,
      origin: await requestOrigin()
    });
  } catch (error) {
    logFailure("add card", session.restaurantId, error);
    redirect(`/admin/billing?card=${errorCode(error)}`);
  }
  redirect(url);
}

export async function setAutopayAction(formData: FormData) {
  const session = await requireRestaurantRole([...BILLING_ROLES]);
  try {
    await setAutopay(session.restaurantId, formData.get("enabled") === "true", session.userId);
  } catch (error) {
    logFailure("autopay", session.restaurantId, error);
    redirect(`/admin/billing?card=${errorCode(error)}`);
  }
  revalidatePath("/admin/billing");
}

export async function removeBillingCardAction() {
  const session = await requireRestaurantRole([...BILLING_ROLES]);
  try {
    await removeBillingCard(session.restaurantId);
  } catch (error) {
    logFailure("remove card", session.restaurantId, error);
    redirect(`/admin/billing?card=${errorCode(error)}`);
  }
  revalidatePath("/admin/billing");
}
