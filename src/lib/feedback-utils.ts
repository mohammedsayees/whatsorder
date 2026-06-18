import { createHash } from "node:crypto";

export function hashFeedbackToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function customerDisplayName(fullName: string, anonymous: boolean) {
  if (anonymous) {
    return "Anonymous";
  }

  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "Verified customer";
  }

  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts.at(-1)?.[0] ?? ""}.`;
}
