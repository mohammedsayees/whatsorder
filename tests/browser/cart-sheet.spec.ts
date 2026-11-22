import { test, expect } from "@playwright/test";

const lines = [
  { item_id: "karak", name: "Karak Tea", price: 2, quantity: 1, options: [{ option_id: "m", group_id: "size", name: "Medium", price_delta: 1 }] },
  { item_id: "water", name: "Water", price: 1, quantity: 2 }
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((saved) => {
    window.localStorage.setItem("whatsorder-cart-v2-cart-fixture", JSON.stringify(saved));
  }, lines);
});

test("the cart drawer lists, changes and removes lines", async ({ page }) => {
  await page.goto("/?mode=cart-sheet");
  const dialog = page.getByRole("dialog", { name: "Your cart" });
  await expect(dialog.getByText("Prices in your cart were updated.")).toBeVisible();
  await expect(dialog.getByText("Medium")).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Checkout/ })).toHaveText(/AED\s?4/);

  await dialog.getByRole("button", { name: "More Water" }).click();
  await expect(dialog.getByRole("link", { name: /Checkout/ })).toHaveText(/AED\s?5/);

  // Only lines with options can be edited; Edit hands the line back.
  await expect(dialog.getByRole("button", { name: "Edit" })).toHaveCount(1);
  await dialog.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByTestId("edited")).toHaveText("Karak Tea");

  await dialog.getByRole("button", { name: "Remove" }).first().click();
  await expect(dialog.getByText("Karak Tea")).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: /Checkout/ })).toHaveText(/AED\s?3/);
});

test("clearing the cart takes a second tap", async ({ page }) => {
  await page.goto("/?mode=cart-sheet");
  const dialog = page.getByRole("dialog", { name: "Your cart" });
  await dialog.getByRole("button", { name: "Clear cart" }).click();
  await expect(dialog.getByText("Water")).toBeVisible();
  await dialog.getByRole("button", { name: "Tap again to clear" }).click();
  await expect(dialog.getByText("Your cart is empty.")).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Checkout/ })).toHaveCount(0);
});
