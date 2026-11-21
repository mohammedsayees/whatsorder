export const accessTokenCookieName = "whatsorder_access_token";
export const refreshTokenCookieName = "whatsorder_refresh_token";
// Selects which restaurant an admin who belongs to several is currently acting on.
export const activeRestaurantCookieName = "whatsorder_active_restaurant";
// Marks a session started with WhatsApp login, whose refresh cookie lives 90
// days instead of 30 (older owners should rarely see the login screen).
export const longSessionCookieName = "whatsorder_long_session";
// Short-lived: which phone the code screen is waiting on (never in the URL).
export const ownerLoginPhoneCookieName = "whatsorder_owner_login_phone";

export const DEFAULT_REFRESH_COOKIE_DAYS = 30;

export function refreshCookieMaxAgeSeconds(longSession: boolean, longDays = 90): number {
  return 60 * 60 * 24 * (longSession ? longDays : DEFAULT_REFRESH_COOKIE_DAYS);
}
