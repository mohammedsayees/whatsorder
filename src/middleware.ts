import { NextRequest, NextResponse } from "next/server";
import {
  accessTokenCookieName,
  refreshTokenCookieName,
} from "@/lib/auth-cookies";

function tokenExpiresSoon(token: string) {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")
    ) as { exp?: number };
    return !payload.exp || payload.exp <= Math.floor(Date.now() / 1000) + 60;
  } catch {
    return true;
  }
}

type RefreshedSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

function nextResponse(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  // AdminLayout uses this server-controlled value to enforce Jobs-only route
  // boundaries. Always overwrite a same-named client header.
  requestHeaders.set("x-whatsorder-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

// Direct GoTrue call instead of @supabase/supabase-js — the full client pulls
// ~85 kB (postgrest/realtime/storage) into the middleware bundle and rebuilds
// it per request, only to issue this single POST.
async function refreshSupabaseSession(
  url: string,
  anonKey: string,
  refreshToken: string
): Promise<RefreshedSession | null> {
  try {
    const response = await fetch(
      `${url.replace(/\/$/, "")}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return null;
    }

    const session = (await response.json()) as Partial<RefreshedSession>;

    if (!session.access_token || !session.refresh_token) {
      return null;
    }

    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: Number(session.expires_in) || 3600
    };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get(accessTokenCookieName)?.value;
  const refreshToken = request.cookies.get(refreshTokenCookieName)?.value;

  if (!refreshToken || (accessToken && !tokenExpiresSoon(accessToken))) {
    return nextResponse(request);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anonKey) {
    return nextResponse(request);
  }

  const session = await refreshSupabaseSession(url, anonKey, refreshToken);
  const response = nextResponse(request);

  if (!session) {
    response.cookies.delete(accessTokenCookieName);
    response.cookies.delete(refreshTokenCookieName);
    return response;
  }

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/"
  };
  response.cookies.set(accessTokenCookieName, session.access_token, {
    ...cookieOptions,
    maxAge: Math.max(60, session.expires_in)
  });
  response.cookies.set(refreshTokenCookieName, session.refresh_token, {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 30
  });

  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/admin-login",
    "/auth/:path*",
    "/select-restaurant",
    "/super-admin/:path*"
  ]
};
