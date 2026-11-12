import { createHash, randomBytes } from "node:crypto";

// One-time, short-lived proof that lets a freshly signed-in owner choose a
// password at /auth/setup-password. Shared by invite acceptance and owner
// email verification. The raw token lives only in an httpOnly cookie; the
// membership row stores its hash.
export const passwordSetupCookieName = "whatsorder_invite_password_setup";
export const passwordSetupLifetimeMs = 15 * 60 * 1000;

export function hashPasswordSetupToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createPasswordSetupToken() {
  return randomBytes(32).toString("base64url");
}
