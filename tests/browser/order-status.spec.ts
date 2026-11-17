import { test, expect } from "@playwright/test";

test("a New order waiting too long offers WhatsApp and a call", async ({ page }) => {
  await page.route("**/api/customer/order-status**", route => route.fulfill({ status: 404, body: "{}" }));
  await page.goto("/?mode=status-waiting");
  await expect(page.getByText("The restaurant hasn't confirmed yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Call restaurant" })).toHaveAttribute("href", /^tel:\+\d+$/);
  const send = page.getByRole("link", { name: "Send on WhatsApp" });
  expect(decodeURIComponent((await send.getAttribute("href"))!)).toContain("Tracked order");
});

test("the timeline follows live status updates", async ({ page }) => {
  let requested = "";
  await page.route("**/api/customer/order-status**", route => {
    requested = route.request().url();
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "Out for Delivery",
        created_at: new Date(Date.now() - 8 * 60_000).toISOString(),
        fulfilment_type: "delivery",
        status_events: [{ to_status: "Out for Delivery", created_at: new Date().toISOString() }]
      })
    });
  });
  await page.goto("/?mode=status-live");
  // Accepted 6 minutes ago + 12 measured minutes of prep.
  await expect(page.getByText(/Usually leaves the kitchen around/)).toBeVisible();
  const steps = page.getByRole("listitem");
  await expect(page.getByText("Preparing", { exact: true })).toHaveClass(/font-black/);
  await expect(page.getByText("On the way", { exact: true })).toHaveClass(/text-stone-400/);
  await expect(page.getByText("The restaurant hasn't confirmed yet")).toHaveCount(0);

  // Returning to the tab refreshes immediately instead of waiting for the poll.
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByText("On the way", { exact: true })).toHaveClass(/font-black/);
  // Out for delivery: the kitchen estimate no longer applies.
  await expect(page.getByText(/Usually leaves the kitchen around/)).toHaveCount(0);
  expect(requested).toContain("orderId=43000000-0000-4000-8000-0000000000aa");
  expect(await steps.count()).toBeGreaterThanOrEqual(5);
});
