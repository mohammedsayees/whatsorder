import { beforeEach, expect, it, vi } from "vitest";
import { createQuickProduct } from "./quick-product-actions";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/super-admin-auth", () => ({ requireRestaurantAdmin: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
const input = { id: "43000000-0000-4000-8000-000000000001", categoryId: "43000000-0000-4000-8000-000000000002", name: "Tea", price: 5 };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(requireRestaurantAdmin).mockResolvedValue({ restaurantId: "tenant-a", userId: "staff-a" } as never); });
it("rejects invalid prices before writing", async () => {
  const from = vi.fn(); vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);
  for (const price of [-1, 0, NaN, Infinity, 1.234]) expect((await createQuickProduct({ ...input, price })).error).toBeTruthy();
  expect(from).not.toHaveBeenCalled();
});
it("returns an existing product for a retry scoped to the authenticated restaurant", async () => {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: input.id }, error: null }) };
  const from = vi.fn(() => query); vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);
  expect((await createQuickProduct(input)).item?.id).toBe(input.id);
  expect(query.eq).toHaveBeenCalledWith("restaurant_id", "tenant-a"); expect(from).toHaveBeenCalledTimes(1);
});
it("rejects a category outside the active restaurant", async () => {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
  vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn(() => query) } as never);
  expect((await createQuickProduct(input)).error).toContain("active category");
  expect(query.eq).toHaveBeenCalledWith("restaurant_id", "tenant-a");
});
