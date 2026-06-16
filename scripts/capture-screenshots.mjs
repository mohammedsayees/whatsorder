import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const baseUrl = process.env.WHATSORDER_SCREENSHOT_URL ?? "http://localhost:3001";
const outputDir = path.join(process.cwd(), "screenshots");

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true
});
const page = await browser.newPage();

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${baseUrl}/r/chaixpress`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.screenshot({
  path: path.join(outputDir, "01-chaixpress-mobile-menu.png"),
  fullPage: false
});

await page.getByTestId("add-item-00000000-0000-4000-8000-000000000201").click();
await page.getByTestId("add-item-00000000-0000-4000-8000-000000000222").click();
await page.goto(`${baseUrl}/r/chaixpress/checkout`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.screenshot({
  path: path.join(outputDir, "02-chaixpress-mobile-checkout.png"),
  fullPage: true
});

await page.setViewportSize({ width: 1440, height: 1000 });
await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.screenshot({
  path: path.join(outputDir, "03-whatsorder-admin-dashboard.png"),
  fullPage: false
});

await browser.close();

console.log(`Screenshots saved to ${outputDir}`);
