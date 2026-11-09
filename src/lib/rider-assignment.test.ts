import { describe, expect, it } from "vitest";

import { buildRiderAssignmentMessage } from "./rider-assignment";
import type { Order, Restaurant } from "./types";

const restaurant = {
  id: "23000000-0000-0000-0000-000000000001",
  name: "Chai Xpress",
  address: "Shop 7, Al Tallah Mall",
  city: "Ajman",
  whatsapp_number: "971501111111",
  country_code: "AE",
  currency_code: "AED",
  locale: "en-AE"
} as Restaurant;

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "43000000-0000-0000-0000-1234567890ab",
    restaurant_id: restaurant.id,
    shift_id: null,
    customer_name: "Test Customer",
    customer_phone: "971501234567",
    fulfilment_type: "delivery",
    car_plate_number: null,
    car_description: null,
    table_number: null,
    delivery_area: "Al Rawda 3",
    delivery_address: "Villa 12, Street 4",
    delivery_latitude: null,
    delivery_longitude: null,
    delivery_google_maps_url: "https://maps.google.com/?q=25,55",
    delivery_place_id: null,
    delivery_address_text: null,
    delivery_landmark: "Near the mosque",
    notes: "Kitchen-only note",
    payment_method: "Cash on Delivery",
    items: [{ item_id: "tea", name: "Karak Tea", price: 5, quantity: 2 }],
    subtotal: 10,
    delivery_fee: 2,
    total: 12,
    points_earned: 0,
    points_redeemed: 0,
    loyalty_discount: 0,
    status: "Preparing",
    whatsapp_message: "",
    consent_order_processing: true,
    consent_marketing: false,
    consent_timestamp: "2026-11-10T00:00:00.000Z",
    created_at: "2026-11-10T00:00:00.000Z",
    updated_at: "2026-11-10T00:00:00.000Z",
    ...overrides
  };
}

describe("buildRiderAssignmentMessage", () => {
  it("includes only the delivery and collection facts the rider needs", () => {
    const message = buildRiderAssignmentMessage({
      order: order(),
      restaurant,
      rider: { name: "Ahmed" }
    });

    expect(message).toContain("Delivery assignment — Chai Xpress");
    expect(message).toContain("Order #567890AB");
    expect(message).toContain("Pickup: Shop 7, Al Tallah Mall, Ajman");
    expect(message).toContain("Restaurant contact: 971501111111");
    expect(message).toContain("Customer: Test Customer");
    expect(message).toContain("Phone: 971501234567");
    expect(message).toContain("Area: Al Rawda 3");
    expect(message).toContain("Address: Villa 12, Street 4");
    expect(message).toContain("Landmark: Near the mosque");
    expect(message).toContain("Map: https://maps.google.com/?q=25,55");
    expect(message).toContain("collect AED");
    expect(message).not.toContain("Karak Tea");
    expect(message).not.toContain("Kitchen-only note");
  });

  it("does not claim an unrecorded payment was collected", () => {
    const message = buildRiderAssignmentMessage({
      order: order({ payment_method: null }),
      restaurant,
      rider: { name: "Ahmed" }
    });
    expect(message).toContain("Payment: not recorded");
  });
});
