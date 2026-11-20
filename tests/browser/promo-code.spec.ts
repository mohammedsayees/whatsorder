import { expect, test } from "@playwright/test";

const SAVE10 = { code: "SAVE10", discountType: "percent", discountValue: 10, maxDiscount: 5, minSubtotal: 20 };

test("a valid code previews the discount and drops off below its minimum", async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  await page.route("**/__promo", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, terms: SAVE10, amount: 3 }) });
  });
  await page.goto("/?mode=promo");
  await page.getByRole("button", { name: "Have a promo code?" }).click();
  await page.getByPlaceholder("Promo code").fill(" save10 ");
  await page.getByRole("button", { name: "Apply" }).click();

  await expect(page.getByText("10% off (up to AED 5")).toBeVisible();
  await expect(page.getByTestId("discount")).toHaveText("3");
  await expect(page.getByTestId("total")).toHaveText("27");
  expect(sent!.code).toBe("save10");
  expect(JSON.parse(String(sent!.items))[0].item_id).toBe("tea");

  // Below the code's minimum the discount disappears and the customer is told why.
  await page.getByRole("button", { name: "Shrink cart" }).click();
  await expect(page.getByTestId("discount")).toHaveText("0");
  await expect(page.getByText(/Add AED\s?10(\.00)? more to use this code/)).toBeVisible();

  // Removing it leaves the field open for another code.
  await page.getByRole("button", { name: "Remove promo code" }).click();
  await expect(page.getByPlaceholder("Promo code")).toBeVisible();
  await expect(page.getByTestId("discount")).toHaveText("0");
});

test("a refused code shows the server's reason and applies nothing", async ({ page }) => {
  await page.route("**/__promo", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: false, error: "This promo code has expired." }) })
  );
  await page.goto("/?mode=promo");
  await page.getByRole("button", { name: "Have a promo code?" }).click();
  await page.getByPlaceholder("Promo code").fill("OLD");
  await page.getByPlaceholder("Promo code").press("Enter");
  await expect(page.getByRole("alert")).toHaveText("This promo code has expired.");
  await expect(page.getByTestId("discount")).toHaveText("0");
});
