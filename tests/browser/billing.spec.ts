import { expect, test } from "@playwright/test";

test("an unfinished bill restores items and customer details after reload", async ({ page }) => {
  await page.goto("/?mode=billing");
  await page.getByRole("button", { name: "Test tea", exact: false }).click();
  await page.getByLabel(/Customer name/).fill("Draft customer");
  await page.getByLabel(/Notes/).fill("Less sugar");
  await expect(page.getByText("Draft saved on this device", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/Customer name/)).toHaveValue("Draft customer");
  await expect(page.getByLabel(/Notes/)).toHaveValue("Less sugar");
  await expect(page.getByRole("button", { name: "Remove Test tea" })).toBeVisible();
});

test("held bills stay separate and restaurant switches do not expose drafts", async ({ page }) => {
  await page.goto("/?mode=billing");
  await page.getByRole("button", { name: "Test tea", exact: false }).click();
  await page.getByLabel(/Customer name/).fill("First customer");
  await page.getByRole("button", { name: "Hold & new bill" }).click();
  await expect(page.getByLabel(/Customer name/)).toHaveValue("");
  await expect(page.getByRole("button", { name: "Remove Test tea" })).toHaveCount(0);
  await page.getByText("Drafts (1)", { exact: true }).click();
  await page.getByRole("button", { name: /First customer ·/ }).click();
  await expect(page.getByLabel(/Customer name/)).toHaveValue("First customer");
  await page.getByRole("button", { name: "Switch restaurant" }).click();
  await expect(page.getByLabel(/Customer name/)).toHaveValue("");
  await expect(page.getByText("Drafts (0)", { exact: true })).toBeVisible();
});

test("quick create retains the current ticket and retries the same product identifier", async ({ page }) => {
  const ids: string[] = [];
  await page.route("**/__product", async route => {
    const input = route.request().postDataJSON(); ids.push(input.id);
    await route.fulfill({ status: ids.length === 1 ? 503 : 200, contentType: "application/json", body: JSON.stringify({ item: { id: input.id, name: input.name, price: input.price, category_id: input.categoryId, is_available: true, staff_only: true } }) });
  });
  await page.goto("/?mode=billing");
  await page.getByRole("button", { name: "Test tea", exact: false }).click();
  await page.getByLabel(/Customer name/).fill("Keep customer");
  await page.getByPlaceholder("Search the menu…").fill("New bun");
  await page.getByRole("button", { name: /New product:/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Price", { exact: true }).fill("7");
  await dialog.getByLabel("Category", { exact: true }).selectOption({ label: "Drinks" });
  await dialog.getByRole("button", { name: "Save & add to bill" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByRole("button", { name: "Retry save & add" }).click();
  await expect(dialog).toHaveCount(0);
  expect(ids[0]).toBe(ids[1]);
  await expect(page.getByRole("button", { name: "Remove Test tea" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove New bun" })).toBeVisible();
  await expect(page.getByLabel(/Customer name/)).toHaveValue("Keep customer");
});

test("confirmed submission clears its draft and does not restore it on reload", async ({ page }) => {
  await page.route("**/__staff", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: "Order saved." }) }));
  await page.goto("/?mode=billing");
  await page.getByRole("button", { name: "Test tea", exact: false }).click();
  await page.getByLabel(/Customer name/).fill("Submitted customer");
  await page.getByRole("button", { name: "Send to kitchen", exact: true }).first().click();
  await expect(page.getByText("Order saved.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/Customer name/)).toHaveValue("");
  await expect(page.getByRole("button", { name: "Remove Test tea" })).toHaveCount(0);
});

test("restoring an uncertain submission retries its original identifier", async ({ page }) => {
  const ids: string[] = [];
  await page.route("**/__staff", route => {
    ids.push(route.request().postDataJSON().clientOrderId);
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(ids.length === 1 ? { retryUnchanged: true, error: "Could not confirm the previous save." } : { success: "Already saved." }) });
  });
  await page.goto("/?mode=billing");
  await page.getByRole("button", { name: "Test tea", exact: false }).click();
  await page.getByRole("button", { name: "Send to kitchen", exact: true }).first().click();
  await expect(page.getByText("Could not confirm the previous save.")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/A submission is being checked/)).toBeVisible();
  await page.getByRole("button", { name: "Send to kitchen", exact: true }).first().click();
  await expect(page.getByText("Already saved.", { exact: true })).toBeVisible();
  expect(ids).toHaveLength(2); expect(ids[1]).toBe(ids[0]);
});

test("a second tab cannot overwrite a draft changed in the first", async ({ page, context }) => {
  await page.goto("/?mode=billing");
  await page.getByRole("button", { name: "Test tea", exact: false }).click();
  await expect(page.getByText("Draft saved on this device", { exact: true })).toBeVisible();
  const other = await context.newPage();
  await other.goto("/?mode=billing");
  await expect(other.getByText("Draft restored on this device", { exact: true })).toBeVisible();
  await page.getByLabel(/Customer name/).fill("First tab saved");
  await expect(page.getByText("Draft saved on this device", { exact: true })).toBeVisible();
  await other.getByLabel(/Notes/).fill("Conflicting edit");
  await expect(other.getByText(/This draft changed in another tab/)).toBeVisible();
  // Dismiss the unsaved-change guard only for this deliberate conflict test.
  other.on("dialog", dialog => dialog.accept());
  await other.reload();
  await expect(other.getByLabel(/Customer name/)).toHaveValue("First tab saved");
});
