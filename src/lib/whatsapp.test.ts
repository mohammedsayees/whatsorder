import { describe, expect, it } from "vitest";
import { buildWhatsAppMessage } from "./whatsapp";
import type { Restaurant } from "./types";

const restaurant: Restaurant = {
  id: "restaurant-1",
  name: "Test Cafe",
  slug: "test-cafe",
  logo_url: null,
  whatsapp_number: "971500000000",
  address: "Ajman Corniche",
  delivery_fee: 5,
  minimum_order_amount: 0,
  is_active: true,
  created_at: new Date(0).toISOString()
};

const baseInput = {
  restaurant,
  customerName: "Ahmed",
  customerPhone: "0501234567",
  paymentMethod: "Cash on Delivery" as const,
  items: [{ item_id: "tea", name: "Tea", price: 2, quantity: 2 }],
  subtotal: 4,
  total: 4,
  deliveryFee: 0
};

describe("WhatsApp fulfilment messages", () => {
  it("includes the car plate for Bring to My Car", () => {
    const message = buildWhatsAppMessage({
      ...baseInput,
      fulfilmentType: "car_pickup",
      carPlateNumber: "AJM A 12345",
      carDescription: "White Toyota"
    });

    expect(message).toContain("New Car Pickup Order");
    expect(message).toContain("Plate number: AJM A 12345");
    expect(message).toContain("Car: White Toyota");
    expect(message).not.toContain("Delivery Fee");
  });

  it("shows the restaurant collection address for takeaway", () => {
    const message = buildWhatsAppMessage({
      ...baseInput,
      fulfilmentType: "takeaway"
    });

    expect(message).toContain("New Takeaway Order");
    expect(message).toContain("Collect from: Ajman Corniche");
  });

  it("includes the table number for dine-in", () => {
    const message = buildWhatsAppMessage({
      ...baseInput,
      fulfilmentType: "dine_in",
      tableNumber: "Outdoor 2"
    });

    expect(message).toContain("New Dine-In Order");
    expect(message).toContain("Table: Outdoor 2");
    expect(message).not.toContain("Delivery Fee");
  });
});
