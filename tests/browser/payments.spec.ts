import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/customer/order-status**", route => route.fulfill({ status: 404, body: "{}" }));
});

test("back from Stripe, the order page re-checks the payment by itself", async ({ page }) => {
  await page.clock.install();
  await page.goto("/?mode=status-paying");
  await expect(page.getByText("Confirming your payment… this page updates by itself.")).toBeVisible();
  await page.clock.runFor(7_000);
  expect(await page.evaluate(() => (window as unknown as { __fixtureRefreshes?: number }).__fixtureRefreshes ?? 0)).toBeGreaterThanOrEqual(2);
});

test("a paid online order says so and stops checking", async ({ page }) => {
  await page.clock.install();
  await page.goto("/?mode=status-paid");
  await expect(page.getByText("Paid online. Nothing to pay on collection.")).toBeVisible();
  await page.clock.runFor(7_000);
  expect(await page.evaluate(() => (window as unknown as { __fixtureRefreshes?: number }).__fixtureRefreshes ?? 0)).toBe(0);
});

test("owners see why autopay failed and where to fix it", async ({ page }) => {
  await page.goto("/?mode=billing-autopay-failed");
  await expect(page.getByText(/Autopay couldn.t pay your WhatsOrder invoice: the card has insufficient funds/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Update your card or pay now" })).toHaveAttribute("href", "/admin/billing");
});
