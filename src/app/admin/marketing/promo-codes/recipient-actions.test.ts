import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantRole } from "@/lib/super-admin-auth";
import { getTenantAccess } from "@/lib/billing-data";
import { listCodeRecipients, searchRestaurantCustomers } from "@/lib/promo-assignment-data";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/super-admin-auth", () => ({ requireRestaurantRole: vi.fn() }));
vi.mock("@/lib/billing-data", () => ({ getTenantAccess: vi.fn() }));
vi.mock("@/lib/billing", () => ({
  isManagementBlocked: vi.fn(() => false),
  tenantHasFeature: vi.fn(() => true)
}));
vi.mock("@/lib/promo-assignment-data", () => ({
  listCodeRecipients: vi.fn(),
  searchRestaurantCustomers: vi.fn(),
  countCodeRecipients: vi.fn()
}));

import {
  assignPromoRecipientAction,
  removePromoRecipientAction,
  searchPromoRecipientsAction
} from "./actions";

const restaurantId = "23000000-0000-0000-0000-000000000001";
const promoCodeId = "43000000-0000-4000-8000-000000000001";
const customerId = "53000000-0000-4000-8000-000000000001";

function makeSupabase(audience: string | null) {
  const eq = vi.fn().mockReturnThis();
  const codeQuery = {
    select: vi.fn().mockReturnThis(),
    eq,
    maybeSingle: vi.fn().mockResolvedValue({ data: audience ? { id: promoCodeId, audience } : null, error: null })
  };
  const countQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve({ count: 0, error: null }).then(resolve);
    }
  };
  const insert = vi.fn().mockResolvedValue({ error: null });
  const deleteEq = vi.fn().mockReturnThis();
  const deleteQuery = {
    eq: deleteEq,
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve({ error: null }).then(resolve);
    }
  };
  const from = vi.fn((table: string) => {
    if (table === "promo_codes") return codeQuery;
    return { ...countQuery, insert, delete: vi.fn(() => deleteQuery) };
  });
  return { supabase: { from }, eq, insert, deleteEq };
}

describe("promo recipient actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRestaurantRole).mockResolvedValue({ restaurantId, userId: "user-1" } as never);
    vi.mocked(getTenantAccess).mockResolvedValue({} as never);
    vi.mocked(listCodeRecipients).mockResolvedValue([]);
  });

  it("only lets owners and managers manage recipients", async () => {
    const { supabase } = makeSupabase("assigned");
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);
    await assignPromoRecipientAction(promoCodeId, customerId);
    expect(requireRestaurantRole).toHaveBeenCalledWith(["restaurant_admin", "owner", "manager"]);
  });

  it("assigns within the session's restaurant", async () => {
    const { supabase, eq, insert } = makeSupabase("assigned");
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);

    const result = await assignPromoRecipientAction(promoCodeId, customerId);

    expect(result).toEqual({ ok: true, recipients: [] });
    expect(eq).toHaveBeenCalledWith("restaurant_id", restaurantId);
    expect(insert).toHaveBeenCalledWith({
      restaurant_id: restaurantId,
      promo_code_id: promoCodeId,
      customer_id: customerId,
      created_by: "user-1"
    });
  });

  it("refuses public codes, unknown codes and bad ids", async () => {
    for (const audience of ["everyone", null]) {
      const { supabase, insert } = makeSupabase(audience);
      vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);
      expect((await assignPromoRecipientAction(promoCodeId, customerId)).ok).toBe(false);
      expect(insert).not.toHaveBeenCalled();
    }
    const { supabase, insert } = makeSupabase("assigned");
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);
    expect((await assignPromoRecipientAction(promoCodeId, "not-a-uuid")).ok).toBe(false);
    expect((await removePromoRecipientAction("nope", customerId)).ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("removes only within the session's restaurant", async () => {
    const { supabase, deleteEq } = makeSupabase("assigned");
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);

    await removePromoRecipientAction(promoCodeId, customerId);

    expect(deleteEq).toHaveBeenCalledWith("restaurant_id", restaurantId);
    expect(deleteEq).toHaveBeenCalledWith("promo_code_id", promoCodeId);
    expect(deleteEq).toHaveBeenCalledWith("customer_id", customerId);
  });

  it("searches only this restaurant, with a cleaned query", async () => {
    const { supabase } = makeSupabase("assigned");
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);
    vi.mocked(searchRestaurantCustomers).mockResolvedValue([]);

    await searchPromoRecipientsAction(" Sara,(x)% ");
    expect(searchRestaurantCustomers).toHaveBeenCalledWith(supabase, restaurantId, "Sara x");

    vi.mocked(searchRestaurantCustomers).mockClear();
    expect(await searchPromoRecipientsAction("a")).toEqual({ ok: true, recipients: [] });
    expect(searchRestaurantCustomers).not.toHaveBeenCalled();
  });
});
