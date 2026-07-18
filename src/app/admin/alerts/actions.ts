"use server";

import { cookies } from "next/headers";
import {
  accessTokenCookieName,
  activeRestaurantCookieName,
  refreshTokenCookieName
} from "@/lib/auth-cookies";
import {
  getNewOrderAlertState,
  type NewOrderAlertState
} from "@/lib/data";
import { getUnreadChatConversationIds } from "@/lib/chat-inbox";
import { isRestaurantAdminAccessAllowed } from "@/lib/security";
import { getSupabase, getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

export type RealtimeAccess = {
  accessToken: string;
  restaurantId: string;
};

function tokenExpiresSoon(token: string) {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")
    ) as { exp?: number };

    return !payload.exp || payload.exp <= Math.floor(Date.now() / 1000) + 35 * 60;
  } catch {
    return true;
  }
}

async function validateRealtimeRestaurantAccess(accessToken: string) {
  const supabase = getSupabase();
  const admin = getSupabaseAdmin();

  if (!supabase || !admin) {
    return null;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return null;
  }

  const { data: memberships, error: membershipError } = await admin
    .from("restaurant_users")
    .select("restaurant_id")
    .eq("user_id", userData.user.id)
    .not("accepted_at", "is", null)
    .in("role", ["restaurant_admin", "staff", "owner", "manager"]);

  if (membershipError || !memberships || memberships.length === 0) {
    return null;
  }

  let restaurantId = String(memberships[0].restaurant_id);

  // Multi-restaurant staff: honor the same active-restaurant cookie the rest
  // of the admin session uses, re-validated against live memberships so it can
  // never select a restaurant the user does not belong to. Realtime alerts
  // previously just disabled themselves for these users.
  if (memberships.length > 1) {
    const selectedRestaurantId = (await cookies()).get(
      activeRestaurantCookieName
    )?.value;
    const selectedMembership = selectedRestaurantId
      ? memberships.find(
          (entry) => String(entry.restaurant_id) === selectedRestaurantId
        )
      : undefined;

    if (!selectedMembership) {
      return null;
    }

    restaurantId = String(selectedMembership.restaurant_id);
  }
  const { data: restaurant } = await admin
    .from("restaurants")
    .select("status")
    .eq("id", restaurantId)
    .maybeSingle();

  if (!restaurant || !isRestaurantAdminAccessAllowed(restaurant.status)) {
    return null;
  }

  return restaurantId;
}

export async function getRealtimeAccessTokenAction(): Promise<RealtimeAccess | null> {
  const cookieStore = await cookies();
  const currentAccessToken = cookieStore.get(accessTokenCookieName)?.value ?? "";
  const refreshToken = cookieStore.get(refreshTokenCookieName)?.value ?? "";

  if (currentAccessToken && !tokenExpiresSoon(currentAccessToken)) {
    const restaurantId = await validateRealtimeRestaurantAccess(currentAccessToken);
    return restaurantId
      ? { accessToken: currentAccessToken, restaurantId }
      : null;
  }

  const supabase = getSupabase();
  if (!supabase || !refreshToken) {
    return null;
  }

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken
  });

  if (error || !data.session) {
    cookieStore.delete(accessTokenCookieName);
    cookieStore.delete(refreshTokenCookieName);
    return null;
  }

  const restaurantId = await validateRealtimeRestaurantAccess(data.session.access_token);
  if (!restaurantId) {
    return null;
  }

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/"
  };
  cookieStore.set(accessTokenCookieName, data.session.access_token, {
    ...cookieOptions,
    maxAge: Math.max(60, data.session.expires_in)
  });
  cookieStore.set(refreshTokenCookieName, data.session.refresh_token, {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 30
  });

  return {
    accessToken: data.session.access_token,
    restaurantId
  };
}

export async function getNewOrderAlertStateAction(): Promise<NewOrderAlertState> {
  const session = await requireRestaurantAdmin();
  return getNewOrderAlertState(session.restaurantId);
}

export async function getUnreadChatConversationIdsAction(): Promise<string[]> {
  const session = await requireRestaurantAdmin();
  if (session.role === "staff") {
    return [];
  }

  return getUnreadChatConversationIds(session.restaurantId);
}
