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

test("car pickup customers can tell the restaurant they have arrived", async ({ page }) => {
  await page.route("**/api/customer/order-status**", route => route.fulfill({ status: 404, body: "{}" }));
  let posted: Record<string, unknown> | null = null;
  await page.route("**/api/customer/order-arrived", route => {
    posted = JSON.parse(route.request().postData() ?? "{}");
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ customer_arrived_at: new Date().toISOString(), customer_arrival_note: "Bay 3" })
    });
  });
  await page.goto("/?mode=status-car");
  await expect(page.getByText("Arrived at the restaurant?")).toBeVisible();
  await page.getByLabel("Where are you parked? (optional)").fill("Bay 3");
  await page.getByRole("button", { name: "I've arrived" }).click();
  await expect(page.getByText("The restaurant knows you're outside")).toBeVisible();
  expect(posted).toMatchObject({ orderId: "43000000-0000-4000-8000-0000000000bb", note: "Bay 3" });
  // Same spot: nothing to resend. A new spot offers an update.
  await expect(page.getByRole("button", { name: "Update parking spot" })).toHaveCount(0);
  await page.getByLabel("Where are you parked? (optional)").fill("Bay 7");
  await expect(page.getByRole("button", { name: "Update parking spot" })).toBeVisible();
});

test("the arrival button is only offered for car pickup", async ({ page }) => {
  await page.route("**/api/customer/order-status**", route => route.fulfill({ status: 404, body: "{}" }));
  await page.goto("/?mode=status-live");
  await expect(page.getByText("Arrived at the restaurant?")).toHaveCount(0);
});
