import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabase: vi.fn(), getSupabaseAdmin: vi.fn() }));

const { splitRestaurantForStaff } = await import("./super-admin-auth");

describe("splitRestaurantForStaff", () => {
  const row = {
    id: "r1",
    name: "Chai Xpress",
    slug: "chaixpress",
    phone_country_code: "971",
    internal_notes: "late payer, discount agreed",
    owner_name: "Owner",
    owner_email: "owner@example.com",
    owner_phone: "971500000000",
    owner_email_verified_at: null,
    owner_email_verification_due_at: "2026-11-20T00:00:00Z"
  } as unknown as Parameters<typeof splitRestaurantForStaff>[0];

  it("keeps internal notes and owner details off the staff-visible restaurant", () => {
    const { restaurant } = splitRestaurantForStaff(row);
    const serialized = JSON.stringify(restaurant);
    for (const secret of ["late payer", "owner@example.com", "971500000000", "internal_notes", "owner_"]) {
      expect(serialized).not.toContain(secret);
    }
    expect(restaurant).toMatchObject({ id: "r1", name: "Chai Xpress", slug: "chaixpress", phone_country_code: "971" });
  });

  it("returns owner details separately, without internal notes", () => {
    const { owner } = splitRestaurantForStaff(row);
    expect(owner).toEqual({
      owner_name: "Owner",
      owner_email: "owner@example.com",
      owner_phone: "971500000000",
      owner_email_verified_at: null,
      owner_email_verification_due_at: "2026-11-20T00:00:00Z"
    });
    expect(row.internal_notes).toBe("late payer, discount agreed");
  });
});
