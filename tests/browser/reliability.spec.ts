import { test, expect } from "@playwright/test";

test("saved confirmation survives reload and resends the original order", async ({page}) => {
 await page.goto("/");
 await expect(page.getByRole("heading",{name:"Order saved"})).toBeVisible();
 await expect(page.getByText(/restaurant has not accepted/)).toBeVisible();
 const link=page.getByRole("link",{name:/Send \/ resend/});
 const original=await link.getAttribute("href");
 expect(decodeURIComponent(original!)).toContain("Original saved order: 2 Tea, total 10");
 await page.reload();
 await expect(link).toHaveAttribute("href",original!);
});

test("offline tickets persist and stay isolated across restaurant switches",async({page,context})=>{
 await page.goto("/?mode=queue");
 await context.setOffline(true);
 await page.getByRole("button",{name:"Queue ticket"}).click();
 await expect(page.getByTestId("queue-count")).toHaveText("1");
 await page.getByRole("button",{name:"Switch restaurant"}).click();
 await expect(page.getByTestId("queue-count")).toHaveText("0");
 await expect(page.getByText("restaurant-a",{exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"Switch restaurant"}).click();
 await expect(page.getByTestId("queue-count")).toHaveText("1");
});

test("a failed sync keeps the ticket; reconnect replays the same identifier",async({page,context})=>{
 await page.clock.install();
 const ids:string[]=[];
 let fail=true;
 await page.route("**/__staff",async route=>{
  ids.push(route.request().postDataJSON().clientOrderId);
  await route.fulfill({status:fail?503:200,contentType:"application/json",body:JSON.stringify({success:"Saved",order:{id:"saved-order"}})});
 });
 await page.goto("/?mode=queue");
 await context.setOffline(true);
 await page.getByRole("button",{name:"Queue ticket"}).click();
 await expect(page.getByTestId("queue-count")).toHaveText("1");
 await context.setOffline(false);
 await expect.poll(()=>ids.length).toBe(1);
 await expect(page.getByTestId("queue-count")).toHaveText("1");
 await expect(page.getByTestId("attempts")).toHaveText("1");
 fail=false;
 await context.setOffline(true); await context.setOffline(false);
 await page.clock.fastForward(45_000);
 await expect(page.getByTestId("queue-count")).toHaveText("0");
 expect(ids[1]).toBe(ids[0]);
});

test("payment failure allows retry and completion sends the selected method",async({page})=>{
 let attempts=0;
 await page.route("**/__payment",async route=>{
  expect(route.request().postDataJSON().payment_method).toBe("Cash on Delivery");
  attempts++;
  await route.fulfill({status:attempts===1?503:200,body:"ok"});
 });
 await page.goto("/?mode=payment");
 const cash=page.getByRole("button",{name:"Complete · Cash"});
 await cash.click(); await expect(page.getByRole("alert")).toContainText("Please retry");
 await expect(cash).toBeEnabled(); await cash.click();
 await expect(page.getByText("Order completed",{exact:true})).toBeVisible();
 expect(attempts).toBe(2);
});


test("recoverable server failures retry after reload with the same order id", async ({ page, context }) => {
  await page.clock.install();
  const ids: string[] = [];
  await page.route("**/__staff", async route => {
    ids.push(route.request().postDataJSON().clientOrderId);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(ids.length === 1
      ? { error: "Could not confirm previous save", retryUnchanged: true }
      : { order: { id: "saved-order" }, success: "Saved" }) });
  });
  await page.goto("/?mode=queue");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Queue ticket" }).click();
  await expect(page.getByTestId("queue-count")).toHaveText("1");
  await context.setOffline(false);
  await expect(page.getByTestId("attempts")).toHaveText("1");
  await page.reload();
  await expect(page.getByTestId("queue-count")).toHaveText("1");
  await page.clock.fastForward(45_000);
  await expect(page.getByTestId("queue-count")).toHaveText("0");
  expect(ids).toHaveLength(2);
  expect(ids[1]).toBe(ids[0]);
});
