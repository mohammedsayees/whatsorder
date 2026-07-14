// lib/customer-auth/context.ts
//
// Server-side loader for the signed-in customer's prefill payload. Single
// source of truth shared by the /api/customer/context route AND the server
// components that personalize the PWA (menu stamp card / reorder strip,
// checkout prefill).
//
// Reads the per-café httpOnly session cookie; on a cold open (no cookie) it
// returns immediately WITHOUT touching the database. Only a signed-in request
// hits get_customer_context (service_role-only, bypasses RLS), so this must
// stay server-only.

import { getCustomerSession } from "@/lib/customer-auth/cookies";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { CartLine } from "@/lib/types";

export interface CustomerProfile {
  id: string;
  name: string | null;
  phone: string;
  default_address_text: string | null;
  default_landmark: string | null;
  default_latitude: number | null;
  default_longitude: number | null;
  default_google_maps_url: string | null;
  delivery_area: string | null;
  delivery_address: string | null;
  last_order_at: string | null;
  total_orders: number | null;
  total_spend: number | null;
  consent_marketing: boolean | null;
}

export interface CustomerLoyalty {
  enabled: boolean;
  stamps: number;
  stamps_required: number | null;
  reward: string | null;
  lifetime: number;
}

export interface CustomerRecentOrder {
  id: string;
  created_at: string;
  status: string;
  total: number;
  items: CartLine[];
  fulfilment_type: string | null;
}

export interface CustomerContext {
  signedIn: boolean;
  phone: string | null;
  profile: CustomerProfile | null;
  loyalty: CustomerLoyalty | null;
  recentOrders: CustomerRecentOrder[];
  /** Set when signed in but the lookup failed; callers can treat as "no data". */
  error?: "service_unavailable" | "context_lookup_failed";
}

const COLD_OPEN: CustomerContext = {
  signedIn: false,
  phone: null,
  profile: null,
  loyalty: null,
  recentOrders: []
};

/**
 * Resolve the customer context for a café from the incoming request's cookies.
 * Never throws — a missing session, missing service-role config, or a failed
 * RPC all degrade to a usable (empty) payload so the PWA still renders.
 */
export async function loadCustomerContext(
  restaurantId: string
): Promise<CustomerContext> {
  const identity = await getCustomerSession(restaurantId);
  if (!identity) {
    return COLD_OPEN;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ...COLD_OPEN, signedIn: true, phone: identity.phone, error: "service_unavailable" };
  }

  const { data, error } = await supabase.rpc("get_customer_context", {
    p_restaurant_id: identity.restaurantId,
    p_phone: identity.phone
  });

  if (error) {
    return { ...COLD_OPEN, signedIn: true, phone: identity.phone, error: "context_lookup_failed" };
  }

  // `data` is the jsonb the function returns: { profile, loyalty, recent_orders }.
  const payload = (data ?? {}) as {
    profile?: CustomerProfile | null;
    loyalty?: CustomerLoyalty | null;
    recent_orders?: CustomerRecentOrder[] | null;
  };

  return {
    signedIn: true,
    phone: identity.phone,
    profile: payload.profile ?? null,
    loyalty: payload.loyalty ?? null,
    recentOrders: payload.recent_orders ?? []
  };
}
