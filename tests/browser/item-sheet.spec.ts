import { test, expect } from "@playwright/test";

test("Add with a required choice open points to it instead of adding", async ({ page }) => {
  await page.goto("/?mode=item-sheet");
  const dialog = page.getByRole("dialog", { name: "Karak Tea" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Slow-boiled with cardamom")).toBeVisible();

  // Nothing is pre-selected; the button stays tappable and explains.
  const add = dialog.getByRole("button", { name: /Add to cart/ });
  await expect(page.getByRole("radio", { name: "Small" })).not.toBeChecked();
  await add.click();
  await expect(dialog.getByText("Choose Size first")).toBeVisible();
  await expect(page.getByTestId("added")).toHaveText("");

  await page.getByText("Large").click();
  await expect(dialog.getByText("Choose Size first")).toHaveCount(0);
  await expect(dialog.getByText("Done")).toBeVisible();
  await dialog.getByRole("button", { name: "More" }).click();
  await expect(add).toHaveText(/AED\s?6/);
  await add.click();
  await expect(page.getByTestId("added")).toHaveText("2x Large");
});

test("Escape and the backdrop close the sheet", async ({ page }) => {
  await page.goto("/?mode=item-sheet");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Open item" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  // A tap inside the sheet keeps it open; a tap on the dimmed backdrop closes.
  // (The fixture has no Tailwind, so the click goes to the backdrop element.)
  await page.getByRole("heading", { name: "Karak Tea" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").locator("xpath=..").dispatchEvent("click");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
