import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/super-admin-data", () => ({ getPublicAppUrl: () => "https://app.example" }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

const { findAuthUserByEmail } = await import("./restaurant-invitations");

function fakeAdmin(total: number, failOnPage?: number) {
  const calls: number[] = [];
  const users = Array.from({ length: total }, (_, i) => ({ id: `u${i}`, email: `user${i}@example.com` }));
  return {
    calls,
    client: {
      auth: {
        admin: {
          listUsers: async ({ page, perPage }: { page: number; perPage: number }) => {
            calls.push(page);
            if (page === failOnPage) return { data: { users: [] }, error: { message: "boom" } };
            return { data: { users: users.slice((page - 1) * perPage, page * perPage) }, error: null };
          }
        }
      }
    } as unknown as Parameters<typeof findAuthUserByEmail>[0]
  };
}

describe("findAuthUserByEmail", () => {
  it("finds users beyond the first 1,000", async () => {
    const admin = fakeAdmin(2500);
    const user = await findAuthUserByEmail(admin.client, "USER2100@example.com");
    expect(user?.id).toBe("u2100");
    expect(admin.calls).toEqual([1, 2, 3]);
  });

  it("returns null after the last page", async () => {
    const admin = fakeAdmin(1500);
    expect(await findAuthUserByEmail(admin.client, "nobody@example.com")).toBeNull();
    expect(admin.calls).toEqual([1, 2]);
  });

  it("throws instead of reporting 'not found' when a page fails", async () => {
    const admin = fakeAdmin(2500, 2);
    await expect(findAuthUserByEmail(admin.client, "user2100@example.com")).rejects.toThrow(/could not be listed/);
  });
});
