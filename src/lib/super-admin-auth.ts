import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabase, getSupabaseAdmin } from "@/lib/supabase";
import {
  accessTokenCookieName,
  activeRestaurantCookieName,
  refreshTokenCookieName
} from "@/lib/auth-cookies";
import {
  classifyMembershipCount,
  isRestaurantAdminAccessAllowed
} from "@/lib/security";
import type { Profile, Restaurant } from "@/lib/types";

export const superAdminCookieName = accessTokenCookieName;
export { refreshTokenCookieName };

export type SuperAdminSession = {
  userId: string;
  email: string;
  profile: Profile;
};

export type RestaurantAdminSession = {
  userId: string;
  email: string;
  role: "restaurant_admin" | "staff" | "owner" | "manager";
  restaurantId: string;
  restaurant: Restaurant;
};

export type RestaurantSessionIssue =
  | "not_authenticated"
  | "no_membership"
  | "multiple_memberships"
  | "restaurant_selection_required"
  | "restaurant_unavailable";

export type SelectableRestaurant = {
  restaurantId: string;
  role: RestaurantAdminSession["role"];
  name: string;
  slug: string;
};

export type RestaurantSessionResolution =
  | { session: RestaurantAdminSession; issue: null }
  | { session: null; issue: RestaurantSessionIssue };

// Layouts and pages resolve auth independently during one render. React cache
// keeps that work request-scoped so the same token is verified only once.
export const getAuthenticatedUser = cache(
  async function getAuthenticatedUser() {
    const token = (await cookies()).get(superAdminCookieName)?.value;
    const supabase = getSupabase();

    if (!token || !supabase) {
      return null;
    }

    // getClaims verifies the JWT signature and expiry. With Supabase's
    // asymmetric signing keys this is local after the JWKS is cached, while
    // symmetric-key projects safely fall back to the Auth server.
    const { data: authData, error: authError } = await supabase.auth.getClaims(token);

    if (authError || !authData?.claims.sub) {
      return null;
    }

    return {
      id: authData.claims.sub,
      email:
        typeof authData.claims.email === "string"
          ? authData.claims.email
          : undefined
    };
  }
);

export async function getSuperAdminSession(): Promise<SuperAdminSession | null> {
  const user = await getAuthenticatedUser();
  const admin = getSupabaseAdmin();

  if (!user || !admin) {
    return null;
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .eq("role", "super_admin")
    .maybeSingle();

  if (profileError || !profile) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email ?? profile.email,
    profile: profile as Profile
  };
}

export async function requireSuperAdmin() {
  const session = await getSuperAdminSession();

  if (!session) {
    redirect("/super-admin/login");
  }

  return session;
}

export const resolveRestaurantAdminSession = cache(async function resolveRestaurantAdminSession(): Promise<RestaurantSessionResolution> {
  const user = await getAuthenticatedUser();
  const admin = getSupabaseAdmin();

  if (!user || !admin) {
    return { session: null, issue: "not_authenticated" };
  }

  const { data: memberships, error: membershipError } = await admin
    .from("restaurant_users")
    .select("restaurant_id,role,email")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .in("role", ["restaurant_admin", "staff", "owner", "manager"]);

  if (membershipError || !memberships) {
    return { session: null, issue: "no_membership" };
  }

  const membershipState = classifyMembershipCount(memberships.length);
  if (membershipState === "no_membership") {
    return { session: null, issue: "no_membership" };
  }

  let membership = memberships[0];

  // A user assigned to several restaurants must choose which one they are
  // acting on. The choice is stored in a cookie and re-validated here against
  // live memberships on every request, so it can never select a restaurant the
  // user does not actually belong to.
  if (membershipState === "multiple_memberships") {
    const selectedRestaurantId = (await cookies()).get(activeRestaurantCookieName)?.value;
    const selectedMembership = selectedRestaurantId
      ? memberships.find((entry) => entry.restaurant_id === selectedRestaurantId)
      : undefined;

    if (!selectedMembership) {
      return { session: null, issue: "restaurant_selection_required" };
    }

    membership = selectedMembership;
  }

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("*")
    .eq("id", membership.restaurant_id)
    .maybeSingle();

  if (
    !restaurant ||
    !isRestaurantAdminAccessAllowed(restaurant.status as Restaurant["status"])
  ) {
    return { session: null, issue: "restaurant_unavailable" };
  }

  return {
    issue: null,
    session: {
      userId: user.id,
      email: user.email ?? membership.email,
      role: membership.role as RestaurantAdminSession["role"],
      restaurantId: membership.restaurant_id as string,
      restaurant: restaurant as Restaurant
    }
  };
});

export async function getRestaurantAdminSession() {
  const resolution = await resolveRestaurantAdminSession();
  return resolution.session;
}

export async function requireRestaurantAdmin() {
  const resolution = await resolveRestaurantAdminSession();

  if (resolution.issue === "restaurant_selection_required") {
    redirect("/select-restaurant");
  }

  if (!resolution.session) {
    const messages: Record<
      Exclude<RestaurantSessionIssue, "restaurant_selection_required">,
      string
    > = {
      not_authenticated: "Please sign in to continue.",
      no_membership: "This account does not have an active restaurant assignment.",
      multiple_memberships:
        "This account is assigned to multiple restaurants. Contact WhatsOrder support to choose an active restaurant.",
      restaurant_unavailable: "This restaurant account is currently unavailable."
    };
    redirect(`/admin-login?error=${encodeURIComponent(messages[resolution.issue])}`);
  }

  return resolution.session;
}

export async function getSelectableRestaurants(): Promise<SelectableRestaurant[]> {
  const user = await getAuthenticatedUser();
  const admin = getSupabaseAdmin();

  if (!user || !admin) {
    return [];
  }

  const { data: memberships } = await admin
    .from("restaurant_users")
    .select("restaurant_id,role")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .in("role", ["restaurant_admin", "staff", "owner", "manager"]);

  if (!memberships || memberships.length === 0) {
    return [];
  }

  const restaurantIds = memberships.map((entry) => entry.restaurant_id as string);
  const { data: restaurants } = await admin
    .from("restaurants")
    .select("id,name,slug,status")
    .in("id", restaurantIds);
  const restaurantsById = new Map(
    (restaurants ?? []).map((restaurant) => [restaurant.id as string, restaurant])
  );

  return memberships
    .map((membership) => {
      const restaurant = restaurantsById.get(membership.restaurant_id as string);

      if (
        !restaurant ||
        !isRestaurantAdminAccessAllowed(restaurant.status as Restaurant["status"])
      ) {
        return null;
      }

      return {
        restaurantId: membership.restaurant_id as string,
        role: membership.role as RestaurantAdminSession["role"],
        name: restaurant.name as string,
        slug: restaurant.slug as string
      } satisfies SelectableRestaurant;
    })
    .filter((entry): entry is SelectableRestaurant => entry !== null);
}

export async function requireRestaurantRole(
  allowedRoles: RestaurantAdminSession["role"][]
) {
  const session = await requireRestaurantAdmin();

  if (!allowedRoles.includes(session.role)) {
    redirect("/admin?error=You%20do%20not%20have%20permission%20for%20that%20action.");
  }

  return session;
}
