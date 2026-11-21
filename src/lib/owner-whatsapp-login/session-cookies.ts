import "server-only";

import { cookies } from "next/headers";
import {
  accessTokenCookieName,
  longSessionCookieName,
  refreshCookieMaxAgeSeconds,
  refreshTokenCookieName
} from "@/lib/auth-cookies";
import { OWNER_WHATSAPP_SESSION_DAYS } from "@/lib/owner-whatsapp-login/config";

/**
 * Store a session started with WhatsApp login. The refresh cookie and the
 * long-session marker live 90 days; middleware keeps that length when it
 * refreshes the access token. Logout and revocation still end it at once.
 */
export async function setOwnerWhatsAppSessionCookies(session: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}) {
  const cookieStore = await cookies();
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/"
  };
  const longMaxAge = refreshCookieMaxAgeSeconds(true, OWNER_WHATSAPP_SESSION_DAYS);
  cookieStore.set(accessTokenCookieName, session.accessToken, {
    ...options,
    maxAge: Math.max(60, session.expiresIn)
  });
  cookieStore.set(refreshTokenCookieName, session.refreshToken, { ...options, maxAge: longMaxAge });
  cookieStore.set(longSessionCookieName, "1", { ...options, maxAge: longMaxAge });
}
