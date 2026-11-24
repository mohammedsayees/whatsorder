import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/notification-jobs", () => ({ scheduleOrderNotifications: vi.fn() }));

import { scheduleOrderNotifications } from "@/lib/notification-jobs";
import { runRiderAction } from "@/lib/rider-job-data";
import { getSupabaseAdmin } from "@/lib/supabase";

const token = "t".repeat(40);
const request = {
  token,
  action: "delivered" as const,
  tenderedAmount: 100,
  method: "Cash on Delivery" as const,
  reason: null
};

function mockAdmin(options: {
  assignment: unknown;
  rpc?: { data?: unknown; error?: { code: string; message: string } | null };
}) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null, ...options.rpc });
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: options.assignment, error: null })
  };
  vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn(() => builder), rpc } as never);
  return { rpc, builder };
}

describe("runRiderAction", () => {
  beforeEach(() => vi.resetAllMocks());

  it("treats a malformed token as unknown without touching the database", async () => {
    mockAdmin({ assignment: null });
    expect(await runRiderAction({ ...request, token: "short" })).toEqual({ status: "not_found" });
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("returns not_found for an unknown link", async () => {
    const { rpc } = mockAdmin({ assignment: null });
    expect(await runRiderAction(request)).toEqual({ status: "not_found" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("scopes the RPC by the assignment's own restaurant, never the client's", async () => {
    const { rpc } = mockAdmin({
      assignment: { id: "assignment-1", restaurant_id: "restaurant-1" },
      rpc: { data: { state: "delivered", changed: true, change_due: 46 } }
    });

    const outcome = await runRiderAction(request);

    expect(outcome).toEqual({ status: "ok", state: "delivered", changeDue: 46 });
    expect(rpc).toHaveBeenCalledWith("rider_delivery_action", {
      requested_action: "delivered",
      requested_method: "Cash on Delivery",
      requested_reason: null,
      requested_tendered_amount: 100,
      target_assignment_id: "assignment-1",
      target_restaurant_id: "restaurant-1"
    });
    expect(scheduleOrderNotifications).toHaveBeenCalledWith("restaurant-1");
  });

  it("does not re-notify the customer when nothing changed (a repeated tap)", async () => {
    mockAdmin({
      assignment: { id: "assignment-1", restaurant_id: "restaurant-1" },
      rpc: { data: { state: "delivered", changed: false } }
    });

    expect(await runRiderAction(request)).toMatchObject({ status: "ok", state: "delivered" });
    expect(scheduleOrderNotifications).not.toHaveBeenCalled();
  });

  it("returns business-rule failures as rejected and infrastructure failures as errors", async () => {
    mockAdmin({
      assignment: { id: "assignment-1", restaurant_id: "restaurant-1" },
      rpc: { error: { code: "P0001", message: "Cash received is less than the amount due" } }
    });
    expect(await runRiderAction(request)).toEqual({
      status: "rejected",
      message: "Cash received is less than the amount due"
    });

    mockAdmin({
      assignment: { id: "assignment-1", restaurant_id: "restaurant-1" },
      rpc: { error: { code: "57014", message: "statement timeout" } }
    });
    await expect(runRiderAction(request)).rejects.toThrow("unavailable");
  });
});
