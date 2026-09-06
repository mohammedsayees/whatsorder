import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  admin: null as unknown, after: vi.fn(), whatsapp: vi.fn(), push: vi.fn()
}));
vi.mock("next/server", () => ({ after: state.after }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => state.admin }));
vi.mock("@/lib/order-notifications", () => ({ sendOrderStatusNotification: state.whatsapp }));
vi.mock("@/lib/web-push", () => ({ sendOrderStatusPushNotification: state.push }));
import { processOrderNotifications, scheduleOrderNotifications } from "./notification-jobs";

function setup(options: { attempts?: number; status?: string; writeError?: boolean; emptyWrite?: boolean } = {}) {
  const writes: Record<string, unknown>[] = [];
  const filters: Record<string, unknown>[] = [];
  const job = { id: "job", restaurant_id: "tenant", order_id: "order", order_status: "Completed", channel: "whatsapp", attempts: options.attempts ?? 1, lease_token: "lease" };
  const rpc = vi.fn().mockResolvedValueOnce({ data: [job] }).mockResolvedValue({ data: [] });
  state.admin = {
    rpc,
    from: (table: string) => {
      const where: Record<string, unknown> = { table };
      filters.push(where);
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { where[key] = value; return query; },
        update: (payload: Record<string, unknown>) => { writes.push(payload); return query; },
        maybeSingle: async () => ({ data: table === "restaurants" ? { id: "tenant", is_active: true } : { status: options.status ?? "Completed" } }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: options.emptyWrite ? [] : [{ id: "job" }], error: options.writeError ? { message: "DB down" } : null }).then(resolve)
      };
      return query;
    }
  };
  return { rpc, writes, filters };
}
beforeEach(() => { vi.resetAllMocks(); state.whatsapp.mockResolvedValue({ status: "accepted" }); });
describe("durable notification worker", () => {
  it("schedules work after the response without waiting for delivery", () => {
    scheduleOrderNotifications("tenant");
    expect(state.after).toHaveBeenCalledOnce();
    expect(state.whatsapp).not.toHaveBeenCalled();
  });
  it("claims and acknowledges using tenant and lease boundaries", async () => {
    const { filters, writes, rpc } = setup();
    expect(await processOrderNotifications("tenant")).toMatchObject({ accepted: 1 });
    expect(rpc).toHaveBeenCalledWith("claim_order_notification", { target_restaurant_id: "tenant" });
    expect(filters).toContainEqual({ table: "order_notification_jobs", restaurant_id: "tenant", id: "job", lease_token: "lease" });
    expect(writes[0].status).toBe("accepted");
  });
  it("keeps transient failures retryable with a later due time", async () => {
    const { writes } = setup();
    state.whatsapp.mockResolvedValue({ status: "failed", reason: "timeout" });
    await processOrderNotifications();
    expect(writes[0].status).toBe("pending");
    expect(new Date(String(writes[0].available_at)).getTime()).toBeGreaterThan(Date.now());
  });
  it("stops retrying after the fifth attempt", async () => {
    const { writes } = setup({ attempts: 5 });
    state.whatsapp.mockResolvedValue({ status: "failed" });
    await processOrderNotifications();
    expect(writes[0].status).toBe("failed");
  });
  it("does not deliver obsolete statuses", async () => {
    const { writes } = setup({ status: "Cancelled" });
    await processOrderNotifications();
    expect(state.whatsapp).not.toHaveBeenCalled();
    expect(writes[0].status).toBe("skipped");
  });
  it.each([{writeError:true}, {emptyWrite:true}])("reports an unrecorded outcome instead of claiming success: %j", async options => {
    setup(options);
    await expect(processOrderNotifications()).rejects.toThrow("could not be recorded");
  });
});
