import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/chat-media", () => ({ CHAT_MEDIA_BUCKET: "whatsapp-media" }));
vi.mock("@/lib/finance-upload", () => ({ FINANCE_DOCUMENT_BUCKET: "finance-documents" }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

const { storagePathFromPublicUrl } = await import("@/lib/restaurant-deletion");
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("storagePathFromPublicUrl", () => {
  it("extracts the object path for the given bucket only", () => {
    const url =
      "https://abc.supabase.co/storage/v1/object/public/menu-images/restaurants/al-noor/karak%20tea.jpg?t=1";
    expect(storagePathFromPublicUrl(url, "menu-images")).toBe("restaurants/al-noor/karak tea.jpg");
    expect(storagePathFromPublicUrl(url, "restaurant-assets")).toBeNull();
    expect(storagePathFromPublicUrl("https://example.com/photo.jpg", "menu-images")).toBeNull();
    expect(storagePathFromPublicUrl(null, "menu-images")).toBeNull();
  });
});

describe("permanent deletion contracts", () => {
  const actions = read("src/app/super-admin/actions.ts");
  const action = actions.slice(actions.indexOf("export async function deleteRestaurantPermanentlyAction"));
  const route = read("src/app/super-admin/(protected)/restaurants/[id]/export/route.ts");
  const helper = read("src/lib/restaurant-deletion.ts");

  it("is super-admin only and requires Cancelled status plus the typed store link", () => {
    expect(action).toContain("await requireSuperAdmin()");
    expect(action).toContain('restaurant.status !== "cancelled"');
    expect(action).toContain("confirmSlug !== restaurant.slug");
    expect(route).toContain("await requireSuperAdmin()");
  });

  it("maps files and sign-ins before deleting the rows that point to them", () => {
    const planAt = action.indexOf("planRestaurantStorageCleanup(");
    const membersAt = action.indexOf("memberUserIds(");
    const rpcAt = action.indexOf('rpc("delete_restaurant_permanently"');
    const cleanupAt = action.indexOf("executeStorageCleanup(");
    expect(planAt).toBeGreaterThan(-1);
    expect(planAt).toBeLessThan(rpcAt);
    expect(membersAt).toBeLessThan(rpcAt);
    expect(cleanupAt).toBeGreaterThan(rpcAt);
  });

  it("never removes super admins or people who belong to another restaurant", () => {
    expect(helper).toContain('profile?.role === "super_admin"');
    expect(helper).toContain("(otherMemberships ?? 0) > 0");
  });

  it("keeps menu photos another restaurant still references", () => {
    expect(helper).toContain('.neq("restaurant_id", restaurant.id)');
    expect(helper).toContain("!protectedPaths.has(path)");
  });
});
