import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderOrderTickets } from "@/lib/order-print";
import { staffPayloadToPrintableOrder, type StaffOrderPayload } from "@/lib/staff-order-payload";

const order = staffPayloadToPrintableOrder({
  clientOrderId: "43000000-0000-4000-8000-000000000001",
  restaurantId: "23000000-0000-0000-0000-000000000001",
  punchedAt: "2026-11-20T10:00:00.000Z",
  action: "paid_cash",
  fulfilmentType: "takeaway",
  items: [{ item_id: "tea", name: "Tea", price: 2, quantity: 1 }],
  tableNumber: "",
  deliveryArea: "",
  deliveryAddress: "",
  deliveryLandmark: "",
  carPlateNumber: "",
  carDescription: "",
  customerName: "",
  customerPhone: "",
  notes: ""
} as StaffOrderPayload);
const restaurant = {
  name: "Chai Xpress",
  whatsapp_number: "971500000000",
  address: null,
  loyalty_stamps_required: 7,
  loyalty_reward_description: "Crunch Burger"
} as never;
const qr = "data:image/png;base64,iVBORw0KGgo=";

describe("receipt stamp-claim QR", () => {
  it("prints the QR and instructions on the receipt only", () => {
    const html = renderOrderTickets({ order, restaurant, kinds: ["kot", "receipt"], reprint: { kot: false, receipt: false }, stampClaimQr: qr });
    expect(html).toContain("Collect your stamp");
    expect(html).toContain(`<img alt="" src="${qr}">`);
    expect(html).toContain("Collect 7 for a free Crunch Burger.");
    expect(html.match(/Collect your stamp/g)).toHaveLength(1);
  });

  it("prints nothing extra without a QR", () => {
    const html = renderOrderTickets({ order, restaurant, kinds: ["receipt"], reprint: { kot: false, receipt: false } });
    expect(html).not.toContain("Collect your stamp");
  });

  it("never embeds anything but a PNG data URL", () => {
    for (const bad of ["https://evil.test/x.png", 'data:image/png;base64,AAA" onerror="x', "data:text/html;base64,PGgxPg=="]) {
      const html = renderOrderTickets({ order, restaurant, kinds: ["receipt"], reprint: { kot: false, receipt: false }, stampClaimQr: bad });
      expect(html).not.toContain("Collect your stamp");
    }
  });
});

describe("receipt_stamp_claim migration", () => {
  const sql = readFileSync(
    new URL("../../supabase/migrations/20261204090000_receipt_stamp_claim.sql", import.meta.url),
    "utf8"
  ).toLowerCase();

  it("only claims recent, uncancelled staff orders without a phone, once", () => {
    expect(sql).toContain("order_record.source <> 'staff'");
    expect(sql).toContain("interval '24 hours'");
    expect(sql).toContain("'already_claimed'");
    expect(sql).toContain("on conflict (order_id) where type = 'earned' and order_id is not null");
  });

  it("never grants marketing consent and is service-role only", () => {
    expect(sql).toContain("on conflict (restaurant_id, phone) do nothing");
    expect(sql).not.toMatch(/consent_marketing\s*=\s*true/);
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
  });
});
