"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/super-admin-auth";
import {
  assignPlan,
  changeStatusManually,
  issueCurrentPeriodInvoice,
  recordPayment,
  voidInvoice,
  type BillingActor
} from "@/lib/billing-data";
import { PAYMENT_METHODS, type PaymentMethod, type SubscriptionStatus } from "@/lib/billing";

const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  "trialing",
  "active",
  "past_due",
  "suspended",
  "cancelled"
];

function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function queryError(message: string): string {
  return encodeURIComponent(message);
}

async function actorFromSession(): Promise<BillingActor> {
  const session = await requireSuperAdmin();
  return { userId: session.userId, role: "super_admin" };
}

function revalidateBilling(restaurantId: string) {
  revalidatePath("/super-admin/billing");
  revalidatePath(`/super-admin/billing/${restaurantId}`);
}

function finish(restaurantId: string, result: { ok: boolean; error?: string }, tab: string) {
  if (!result.ok) {
    redirect(
      `/super-admin/billing/${restaurantId}?error=${queryError(result.error ?? "Action failed.")}`
    );
  }
  revalidateBilling(restaurantId);
  redirect(`/super-admin/billing/${restaurantId}?saved=${tab}`);
}

export async function assignPlanAction(formData: FormData) {
  const actor = await actorFromSession();
  const restaurantId = field(formData, "restaurant_id");
  const planId = field(formData, "plan_id");
  const startTrial = formData.get("start_trial") === "on";

  if (!restaurantId || !planId) {
    redirect(`/super-admin/billing?error=${queryError("Restaurant and plan are required.")}`);
  }

  const result = await assignPlan(restaurantId, planId, { startTrial, actor });
  finish(restaurantId, result, "plan");
}

export async function issueInvoiceAction(formData: FormData) {
  const actor = await actorFromSession();
  const restaurantId = field(formData, "restaurant_id");
  const amountRaw = field(formData, "unit_amount");
  const description = field(formData, "description");

  if (!restaurantId) {
    return;
  }

  const unitAmount = amountRaw ? Number(amountRaw) : undefined;
  if (amountRaw && (!Number.isFinite(unitAmount) || (unitAmount as number) < 0)) {
    redirect(
      `/super-admin/billing/${restaurantId}?error=${queryError("Enter a valid invoice amount.")}`
    );
  }

  const result = await issueCurrentPeriodInvoice(restaurantId, {
    unitAmount,
    description,
    actor
  });
  finish(restaurantId, result, "invoice");
}

export async function recordPaymentAction(formData: FormData) {
  const actor = await actorFromSession();
  const restaurantId = field(formData, "restaurant_id");
  const invoiceId = field(formData, "invoice_id");
  const amount = Number(field(formData, "amount"));
  const methodRaw = field(formData, "method") as PaymentMethod;
  const method = PAYMENT_METHODS.includes(methodRaw) ? methodRaw : "bank_transfer";
  const reference = field(formData, "reference");
  const receivedAt = field(formData, "received_at");

  if (!restaurantId || !invoiceId) {
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    redirect(
      `/super-admin/billing/${restaurantId}?error=${queryError("Enter a valid payment amount.")}`
    );
  }

  const result = await recordPayment(restaurantId, invoiceId, {
    amount,
    method,
    reference,
    receivedAt: receivedAt || undefined,
    actor
  });
  finish(restaurantId, result, "payment");
}

export async function voidInvoiceAction(formData: FormData) {
  await actorFromSession();
  const restaurantId = field(formData, "restaurant_id");
  const invoiceId = field(formData, "invoice_id");

  if (!restaurantId || !invoiceId) {
    return;
  }

  const result = await voidInvoice(restaurantId, invoiceId);
  finish(restaurantId, result, "void");
}

export async function changeStatusAction(formData: FormData) {
  const actor = await actorFromSession();
  const restaurantId = field(formData, "restaurant_id");
  const statusRaw = field(formData, "status") as SubscriptionStatus;
  const reason = field(formData, "reason");

  if (!restaurantId || !SUBSCRIPTION_STATUSES.includes(statusRaw)) {
    redirect(`/super-admin/billing/${restaurantId}?error=${queryError("Choose a valid status.")}`);
  }

  const result = await changeStatusManually(restaurantId, statusRaw, reason, actor);
  finish(restaurantId, result, "status");
}
