export function onboardingOrdersHref(orderId: string) {
  const safeOrderId = encodeURIComponent(orderId);
  return `/admin/orders?status=new&sort=oldest&q=${safeOrderId}&onboarding=test-order&highlight=${safeOrderId}#order-${safeOrderId}`;
}
