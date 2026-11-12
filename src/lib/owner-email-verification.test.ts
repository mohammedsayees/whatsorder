import { describe, expect, it } from "vitest";

import {
  daysUntil,
  ownerEmailVerificationDueAt,
  ownerEmailVerificationState
} from "@/lib/owner-email-verification";

const now = new Date("2026-11-12T10:00:00Z");

describe("owner email verification", () => {
  it("is verified when confirmed, or when no grace period was started", () => {
    expect(ownerEmailVerificationState({ owner_email_verified_at: now.toISOString() }, now)).toBe("verified");
    expect(ownerEmailVerificationState({}, now)).toBe("verified");
  });

  it("is pending inside the grace period and overdue after it", () => {
    const due = ownerEmailVerificationDueAt(now).toISOString();
    expect(ownerEmailVerificationState({ owner_email_verification_due_at: due }, now)).toBe("pending");
    expect(
      ownerEmailVerificationState(
        { owner_email_verification_due_at: due },
        new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000)
      )
    ).toBe("overdue");
  });

  it("gives a 7-day grace period and counts whole days left", () => {
    const due = ownerEmailVerificationDueAt(now);
    expect(daysUntil(due.toISOString(), now)).toBe(7);
    expect(daysUntil(now.toISOString(), now)).toBe(0);
  });
});
