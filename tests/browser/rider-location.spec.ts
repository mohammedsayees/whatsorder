import { test, expect } from "@playwright/test";

test.use({ geolocation: { latitude: 25.41, longitude: 55.51, accuracy: 15 }, permissions: ["geolocation"] });

test("the rider page shares GPS and stops when the delivery ends", async ({ page }) => {
  const sent: Record<string, unknown>[] = [];
  let answer = "active";
  await page.route("**/api/rider/location", route => {
    sent.push(JSON.parse(route.request().postData() ?? "{}"));
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ state: answer }) });
  });
  await page.goto("/?mode=rider-page");
  await page.getByRole("button", { name: "Start sharing location" }).click();
  await expect(page.getByText("Sharing your location")).toBeVisible();
  await expect(page.getByText(/Last sent/)).toBeVisible();
  expect(sent[0]).toMatchObject({ token: "riderTrackingTokenAAAAAAAAAAAAAAAA", latitude: 25.41, longitude: 55.51 });

  // The server reports the order delivered: the page stops by itself.
  answer = "ended";
  await page.getByRole("button", { name: "Stop sharing" }).click();
  await page.getByRole("button", { name: "Start sharing location" }).click();
  await expect(page.getByText("This delivery is finished. Location sharing is off. Thank you!")).toBeVisible();
});
