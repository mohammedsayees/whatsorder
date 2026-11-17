import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCustomerRiderView, recordRiderLocation } from "@/lib/rider-location-data";
import { getSupabaseAdmin } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));

const token = "riderTrackingTokenAAAAAAAAAAAAAAAA";
const fix = { latitude: 25.41, longitude: 55.51, accuracy: 10 };
const assignment = { id: "asg-1", restaurant_id: "rest-a", order_id: "order-1", rider_id: "rider-1" };

type Op = { table: string; op: string; filters: [string, unknown][]; payload?: unknown };

/**
 * Supabase stand-in: each `maybeSingle()` read on a table returns the next
 * queued answer for that table; writes are recorded with their filters.
 */
function mockDb(reads: Record<string, unknown[]>) {
  const ops: Op[] = [];
  const queues = new Map(Object.entries(reads).map(([table, rows]) => [table, [...rows]]));

  const from = (table: string) => {
    const op: Op = { table, op: "select", filters: [] };
    const builder: Record<string, unknown> = {};
    const chain = (fn?: (...args: unknown[]) => void) => (...args: unknown[]) => {
      fn?.(...args);
      return builder;
    };

    builder.select = chain();
    builder.order = chain();
    builder.limit = chain();
    builder.eq = chain((column, value) => op.filters.push([String(column), value]));
    builder.delete = chain(() => {
      op.op = "delete";
      ops.push(op);
    });
    builder.upsert = async (payload: unknown) => {
      op.op = "upsert";
      op.payload = payload;
      ops.push(op);
      return { error: null };
    };
    builder.maybeSingle = async () => ({ data: queues.get(table)?.shift() ?? null, error: null });
    builder.then = (resolve: (value: unknown) => void) => resolve({ data: null, error: null });
    return builder;
  };

  vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);
  return ops;
}

const activeOrder = { status: "Out for Delivery", fulfilment_type: "delivery", delivery_area: "Nahda" };

describe("recordRiderLocation", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects malformed and unknown links", async () => {
    mockDb({});
    expect(await recordRiderLocation("short", fix)).toBe("not_found");
    mockDb({ order_rider_assignments: [null] });
    expect(await recordRiderLocation(token, fix)).toBe("not_found");
  });

  it("saves the latest position for the current assignment, scoped to it", async () => {
    const ops = mockDb({
      order_rider_assignments: [assignment, { id: "asg-1" }],
      orders: [activeOrder],
      restaurants: [{ name: "Chai Xpress" }],
      rider_live_locations: [null]
    });
    expect(await recordRiderLocation(token, fix)).toBe("active");
    const upsert = ops.find((op) => op.op === "upsert");
    expect(upsert?.payload).toMatchObject({
      assignment_id: "asg-1",
      restaurant_id: "rest-a",
      order_id: "order-1",
      latitude: 25.41,
      longitude: 55.51
    });
  });

  it("ignores positions sent too quickly", async () => {
    const ops = mockDb({
      order_rider_assignments: [assignment, { id: "asg-1" }],
      orders: [activeOrder],
      restaurants: [{ name: "Chai Xpress" }],
      rider_live_locations: [{ updated_at: new Date().toISOString() }]
    });
    expect(await recordRiderLocation(token, fix)).toBe("active");
    expect(ops.some((op) => op.op === "upsert")).toBe(false);
  });

  it("stops and forgets the position once the order is reassigned or finished", async () => {
    let ops = mockDb({
      order_rider_assignments: [assignment, { id: "asg-2" }],
      orders: [activeOrder],
      restaurants: [{ name: "Chai Xpress" }]
    });
    expect(await recordRiderLocation(token, fix)).toBe("replaced");
    expect(ops.find((op) => op.op === "delete")?.filters).toEqual([
      ["assignment_id", "asg-1"],
      ["restaurant_id", "rest-a"]
    ]);

    ops = mockDb({
      order_rider_assignments: [assignment, { id: "asg-1" }],
      orders: [{ ...activeOrder, status: "Completed" }],
      restaurants: [{ name: "Chai Xpress" }]
    });
    expect(await recordRiderLocation(token, fix)).toBe("ended");
    expect(ops.some((op) => op.op === "delete")).toBe(true);
    expect(ops.some((op) => op.op === "upsert")).toBe(false);
  });
});

describe("getCustomerRiderView", () => {
  beforeEach(() => vi.resetAllMocks());

  const outForDelivery = { status: "Out for Delivery" as const, fulfilment_type: "delivery" as const };

  it("shows nothing for non-delivery orders or before the order is on its way", async () => {
    const ops = mockDb({});
    expect(await getCustomerRiderView("rest-a", "order-1", { status: "Out for Delivery", fulfilment_type: "takeaway" })).toBeNull();
    expect(await getCustomerRiderView("rest-a", "order-1", { status: "Preparing", fulfilment_type: "delivery" })).toBeNull();
    expect(ops).toHaveLength(0);
  });

  it("deletes stored positions once the order is closed", async () => {
    const ops = mockDb({});
    expect(await getCustomerRiderView("rest-a", "order-1", { status: "Completed", fulfilment_type: "delivery" })).toBeNull();
    expect(ops.find((op) => op.op === "delete")?.filters).toEqual([
      ["restaurant_id", "rest-a"],
      ["order_id", "order-1"]
    ]);
  });

  it("returns the current rider with distance to the delivery pin", async () => {
    mockDb({
      order_rider_assignments: [{ id: "asg-1", rider_id: "rider-1" }],
      delivery_riders: [{ name: "Ravi Kumar", phone: "0501234567" }],
      rider_live_locations: [{ latitude: 25.41, longitude: 55.51, updated_at: new Date().toISOString() }],
      orders: [{ delivery_latitude: 25.4, delivery_longitude: 55.5 }],
      restaurants: [{ phone_country_code: "971" }]
    });
    const view = await getCustomerRiderView("rest-a", "order-1", outForDelivery);
    expect(view?.name).toBe("Ravi");
    expect(view?.phone).toBe("971501234567");
    expect(view?.location?.distanceKm).toBeGreaterThan(1);
    expect(view?.location?.distanceKm).toBeLessThan(2);
    expect(view?.location?.mapsUrl).toContain("25.41,55.51");
  });

  it("hides a stale position but still shows the rider", async () => {
    mockDb({
      order_rider_assignments: [{ id: "asg-1", rider_id: "rider-1" }],
      delivery_riders: [{ name: "Ravi", phone: "971501234567" }],
      rider_live_locations: [{ latitude: 25.41, longitude: 55.51, updated_at: new Date(Date.now() - 11 * 60_000).toISOString() }],
      orders: [{ delivery_latitude: null, delivery_longitude: null }],
      restaurants: [{ phone_country_code: "971" }]
    });
    const view = await getCustomerRiderView("rest-a", "order-1", outForDelivery);
    expect(view?.name).toBe("Ravi");
    expect(view?.location).toBeNull();
  });
});
