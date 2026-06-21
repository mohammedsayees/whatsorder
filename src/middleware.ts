import { createClient } from "@supabase/supabase-js";
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

export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get(accessTokenCookieName)?.value;
  const refreshToken = request.cookies.get(refreshTokenCookieName)?.value;

  if (!refreshToken || (accessToken && !tokenExpiresSoon(accessToken))) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anonKey) {
    return NextResponse.next();
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken
  });
  const response = NextResponse.next();

  if (error || !data.session) {
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
  response.cookies.set(accessTokenCookieName, data.session.access_token, {
    ...cookieOptions,
    maxAge: Math.max(60, data.session.expires_in)
  });
  response.cookies.set(refreshTokenCookieName, data.session.refresh_token, {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 30
  });

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/admin-login", "/auth/:path*", "/super-admin/:path*"]
};
