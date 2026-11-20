import { beforeEach, describe, expect, it, vi } from "vitest";

import { getRestaurantBySlug } from "@/lib/data";
import { resolveCustomerSession } from "@/lib/customer-auth/session";
import {
  deleteCustomerAddress,
  loadCustomerAddresses,
  saveCustomerAddress,
  setDefaultCustomerAddress
} from "@/lib/customer-addresses-data";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/data", () => ({ getRestaurantBySlug: vi.fn() }));
vi.mock("@/lib/customer-auth/cookies", () => ({ clearCustomerSession: vi.fn() }));
vi.mock("@/lib/customer-auth/session", () => ({ resolveCustomerSession: vi.fn() }));
vi.mock("@/lib/customer-account-data", () => ({ loadCustomerAccount: vi.fn() }));
vi.mock("@/lib/customer-addresses-data", () => ({
  loadCustomerAddresses: vi.fn(),
  saveCustomerAddress: vi.fn(),
  setDefaultCustomerAddress: vi.fn(),
  deleteCustomerAddress: vi.fn()
}));

import {
  deleteCustomerAddressAction,
  saveCustomerAddressAction,
  setDefaultCustomerAddressAction
} from "./actions";

const restaurantId = "23000000-0000-0000-0000-000000000001";
const addressId = "63000000-0000-4000-8000-000000000001";
const phone = "971501234567";
const identity = { restaurantId, phone };
const input = { label: "Home", area: "Al Nahda", building: "Tower 2", flat: "", details: "", landmark: "" };

describe("saved address actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRestaurantBySlug).mockResolvedValue({ id: restaurantId, slug: "chaixpress" } as never);
    vi.mocked(resolveCustomerSession).mockResolvedValue({
      status: "signed_in",
      identity: { restaurantId, phone, issuedAt: 1 }
    });
    vi.mocked(loadCustomerAddresses).mockResolvedValue([]);
  });

  it("saves with the session's identity, never the browser's", async () => {
    vi.mocked(saveCustomerAddress).mockResolvedValue({ ok: true, id: addressId });

    const result = await saveCustomerAddressAction(
      "chaixpress",
      null,
      { ...input, restaurant_id: "someone-else", phone: "971500000000" },
      true
    );

    expect(result).toEqual({ ok: true, id: addressId, addresses: [] });
    expect(saveCustomerAddress).toHaveBeenCalledWith(
      identity,
      null,
      expect.objectContaining({ label: "Home", area: "Al Nahda" }),
      true
    );
    expect(vi.mocked(saveCustomerAddress).mock.calls[0][2]).not.toHaveProperty("restaurant_id");
    expect(loadCustomerAddresses).toHaveBeenCalledWith(identity);
  });

  it("refuses signed-out customers before any write", async () => {
    vi.mocked(resolveCustomerSession).mockResolvedValue({ status: "signed_out" });

    expect(await saveCustomerAddressAction("chaixpress", null, input)).toEqual({ ok: false, error: "signed_out" });
    expect(await setDefaultCustomerAddressAction("chaixpress", addressId)).toEqual({ ok: false, error: "signed_out" });
    expect(await deleteCustomerAddressAction("chaixpress", addressId)).toEqual({ ok: false, error: "signed_out" });
    expect(saveCustomerAddress).not.toHaveBeenCalled();
    expect(setDefaultCustomerAddress).not.toHaveBeenCalled();
    expect(deleteCustomerAddress).not.toHaveBeenCalled();
  });

  it("rejects invalid input and ids without touching the session", async () => {
    expect(await saveCustomerAddressAction("chaixpress", null, { label: "", area: "x" })).toEqual({
      ok: false,
      error: "invalid"
    });
    expect(await saveCustomerAddressAction("chaixpress", "not-a-uuid", input)).toEqual({
      ok: false,
      error: "invalid"
    });
    expect(await deleteCustomerAddressAction("chaixpress", "1 or 1=1")).toEqual({ ok: false, error: "invalid" });
    expect(resolveCustomerSession).not.toHaveBeenCalled();
  });

  it("passes through database refusals", async () => {
    vi.mocked(saveCustomerAddress).mockResolvedValue({ ok: false, error: "limit_reached" });
    vi.mocked(deleteCustomerAddress).mockResolvedValue({ ok: false, error: "not_found" });

    expect(await saveCustomerAddressAction("chaixpress", null, input)).toEqual({ ok: false, error: "limit_reached" });
    expect(await deleteCustomerAddressAction("chaixpress", addressId)).toEqual({ ok: false, error: "not_found" });
    expect(loadCustomerAddresses).not.toHaveBeenCalled();
  });
});
