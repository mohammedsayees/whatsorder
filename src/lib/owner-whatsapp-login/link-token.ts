// lib/owner-whatsapp-login/link-token.ts
//
// The one-tap login link sent on WhatsApp is /auth/wa/<request id>.<code>.
// The request id (a random UUID) finds the owner_login_requests row; the
// 6-digit Supabase code is the secret, verified by Supabase. Nothing secret is
// stored by WhatsOrder. Pure, so it is unit-testable.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^\d{6}$/;

export type OwnerLoginLinkToken = { requestId: string; code: string };

/** The "<request id>.<code>" part of the login link. */
export function buildOwnerLoginLinkSuffix(requestId: string, code: string): string {
  if (!UUID.test(requestId) || !CODE.test(code)) {
    throw new Error("Invalid owner login link parts");
  }
  return `${requestId.toLowerCase()}.${code}`;
}

export function buildOwnerLoginLinkUrl(baseUrl: string, requestId: string, code: string): string {
  return `${baseUrl.replace(/\/$/, "")}/auth/wa/${buildOwnerLoginLinkSuffix(requestId, code)}`;
}

export function parseOwnerLoginLinkToken(token: string | null | undefined): OwnerLoginLinkToken | null {
  if (!token || token.length > 80) {
    return null;
  }
  const dot = token.lastIndexOf(".");
  if (dot < 0) {
    return null;
  }
  const requestId = token.slice(0, dot);
  const code = token.slice(dot + 1);
  if (!UUID.test(requestId) || !CODE.test(code)) {
    return null;
  }
  return { requestId: requestId.toLowerCase(), code };
}
