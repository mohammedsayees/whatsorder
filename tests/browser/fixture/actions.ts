import type { StaffOrderPayload } from "@/lib/staff-order-payload";
export async function submitStaffOrderAction(payload: StaffOrderPayload) {
  const result = await fetch("/__staff", { method: "POST", body: JSON.stringify(payload) });
  if (!result.ok) throw new Error("Network unavailable");
  return result.json();
}
export async function collectPaymentAndCompleteAction(data: FormData) {
 const result = await fetch("/__payment", { method: "POST", body: JSON.stringify(Object.fromEntries(data)) });
 if (!result.ok) throw new Error("Payment failed");
 window.dispatchEvent(new Event("fixture-completed"));
}
export const updateOrderStatusAction = collectPaymentAndCompleteAction;
