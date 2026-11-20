import { expect, test, type Page } from "@playwright/test";

async function openDiscount(page: Page) {
  await page.locator("details:has(summary:has-text('Discount'))").evaluate((details) => {
    (details as HTMLDetailsElement).open = true;
  });
}

test("a cashier discount within the limit is shown and sent with the order", async ({ page }) => {
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/__staff", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: "Order sent to the kitchen." }) });
  });
  await page.goto("/?mode=billing");
  await page.getByRole("button", { name: "Test tea", exact: false }).click();
  for (let i = 0; i < 3; i += 1) await page.getByRole("button", { name: "Add Test tea" }).click();
  await openDiscount(page);

  // Presets above the 10% staff limit are not offered.
  await expect(page.getByRole("button", { name: "15%" })).toHaveCount(0);
  await page.getByRole("button", { name: "10%" }).click();
  await page.getByRole("button", { name: "Regular customer" }).click();
  await expect(page.getByText("Discount 10%", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Pay AED\s?18/ })).toBeVisible();

  await page.getByRole("button", { name: "Send KOT" }).first().click();
  await expect.poll(() => submitted).not.toBeNull();
  expect(submitted!.discount).toEqual({ type: "percent", value: 10, reason: "Regular customer" });
});

test("a discount above the cashier limit or without a reason is not submitted", async ({ page }) => {
  let calls = 0;
  await page.route("**/__staff", async (route) => {
    calls += 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: "ok" }) });
  });
  await page.goto("/?mode=billing");
  await page.getByRole("button", { name: "Test tea", exact: false }).click();
  await page.getByRole("button", { name: "Add Test tea" }).click();
  await openDiscount(page);
  await page.getByRole("button", { name: "AED", exact: true }).click();
  await page.getByLabel("Discount amount").fill("3");
  await expect(page.getByText(/Above your limit of 10%/)).toBeVisible();
  await page.getByRole("button", { name: "Send KOT" }).first().click();
  await expect(page.getByText(/above your limit of 10%/)).toBeVisible();

  await page.getByLabel("Discount amount").fill("1");
  await page.getByRole("button", { name: "Send KOT" }).first().click();
  await expect(page.getByText("Add a reason for the discount.")).toBeVisible();
  expect(calls).toBe(0);
});
