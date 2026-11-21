import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { getSuperAdminSession, resolveRestaurantAdminSession } from "@/lib/super-admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getMenu, getMenuOptionCatalog } from "@/lib/data";
import { parseMenuPrintPdfSettings } from "@/lib/menu-pdf-config";
import { renderMenuPdf } from "@/lib/menu-pdf/render";
import { getStoreShareAssets } from "@/lib/store-share-assets";

vi.mock("@/lib/super-admin-auth", () => ({
  getSuperAdminSession: vi.fn(),
  resolveRestaurantAdminSession: vi.fn(),
  splitRestaurantForStaff: (row: Record<string, unknown>) => {
    const { internal_notes: _notes, owner_email: _email, ...restaurant } = row;
    return { restaurant, owner: {} };
  }
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/data", () => ({ getMenu: vi.fn(), getMenuOptionCatalog: vi.fn() }));
vi.mock("@/lib/menu-pdf-config", () => ({ parseMenuPrintPdfSettings: vi.fn() }));
vi.mock("@/lib/menu-pdf/render", () => ({ renderMenuPdf: vi.fn() }));
vi.mock("@/lib/store-share-assets", () => ({ getStoreShareAssets: vi.fn() }));

const ownRid = "11000000-0000-0000-0000-000000000001";
const otherRid = "22000000-0000-0000-0000-000000000002";

function request(query = "") {
  return new Request(`http://localhost/api/menu/print-pdf${query}`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

function mockRestaurantLookup(row: Record<string, unknown> | null) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null })
  };
  vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn(() => query) } as never);
  return query;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(parseMenuPrintPdfSettings).mockReturnValue({} as never);
  vi.mocked(getMenu).mockResolvedValue({ categories: [], items: [] } as never);
  vi.mocked(getMenuOptionCatalog).mockResolvedValue({ groups: [], options: [], links: [] } as never);
  vi.mocked(getStoreShareAssets).mockResolvedValue({ menuUrl: "u", qrDataUrl: "q" } as never);
  vi.mocked(renderMenuPdf).mockResolvedValue(new Uint8Array([1]) as never);
});

describe("menu print PDF tenant resolution", () => {
  it("prints the session restaurant for owners", async () => {
    vi.mocked(resolveRestaurantAdminSession).mockResolvedValue({
      issue: null,
      session: { restaurantId: ownRid, restaurant: { id: ownRid, slug: "own" } }
    } as never);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(getMenu).toHaveBeenCalledWith(ownRid, { admin: true });
    expect(getSuperAdminSession).not.toHaveBeenCalled();
  });

  it("refuses restaurant_id from a non-super-admin", async () => {
    vi.mocked(getSuperAdminSession).mockResolvedValue(null);
    vi.mocked(resolveRestaurantAdminSession).mockResolvedValue({
      issue: null,
      session: { restaurantId: ownRid, restaurant: { id: ownRid, slug: "own" } }
    } as never);
    mockRestaurantLookup({ id: otherRid, slug: "other" });
    const response = await POST(request(`?restaurant_id=${otherRid}`));
    expect(response.status).toBe(401);
    expect(getMenu).not.toHaveBeenCalled();
    expect(renderMenuPdf).not.toHaveBeenCalled();
  });

  it("rejects a malformed restaurant_id before any auth or lookup", async () => {
    const response = await POST(request("?restaurant_id=not-a-uuid"));
    expect(response.status).toBe(400);
    expect(getSuperAdminSession).not.toHaveBeenCalled();
  });

  it("lets a super admin print the requested restaurant without internal fields", async () => {
    vi.mocked(getSuperAdminSession).mockResolvedValue({ userId: "sa" } as never);
    const query = mockRestaurantLookup({
      id: otherRid,
      slug: "other",
      internal_notes: "secret",
      owner_email: "o@example.com"
    });
    const response = await POST(request(`?restaurant_id=${otherRid}`));
    expect(response.status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("id", otherRid);
    expect(getMenu).toHaveBeenCalledWith(otherRid, { admin: true });
    const rendered = vi.mocked(renderMenuPdf).mock.calls[0][0].restaurant as Record<string, unknown>;
    expect(rendered.internal_notes).toBeUndefined();
    expect(rendered.owner_email).toBeUndefined();
    expect(resolveRestaurantAdminSession).not.toHaveBeenCalled();
  });

  it("404s an unknown restaurant for a super admin", async () => {
    vi.mocked(getSuperAdminSession).mockResolvedValue({ userId: "sa" } as never);
    mockRestaurantLookup(null);
    const response = await POST(request(`?restaurant_id=${otherRid}`));
    expect(response.status).toBe(404);
  });
});
