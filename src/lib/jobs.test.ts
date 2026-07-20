import { describe, expect, it } from "vitest";
import {
  buildWhatsAppApplicationUrl,
  effectiveJobStatus,
  isValidJobStatusTransition,
  normalizeWhatsAppNumber,
  validateJobInput
} from "@/lib/jobs";

const validInput = {
  title: "Barista",
  category: "Barista",
  employment_type: "Full-time",
  emirate: "Dubai",
  city: "Dubai",
  salary_type: "Range",
  salary_min: "2500",
  salary_max: "3200",
  number_of_vacancies: "2",
  contact_whatsapp: "+971 50 123 4567",
  expires_at: "2026-09-01"
};

describe("jobs validation", () => {
  it("normalizes UAE local and international WhatsApp numbers", () => {
    expect(normalizeWhatsAppNumber("050 123 4567")).toBe("971501234567");
    expect(normalizeWhatsAppNumber("+91 98765 43210")).toBe("919876543210");
    expect(normalizeWhatsAppNumber("123")).toBeNull();
  });

  it("rejects an invalid salary range", () => {
    const result = validateJobInput(
      { ...validInput, salary_min: "4000", salary_max: "3000" },
      new Date("2026-07-21T00:00:00Z")
    );
    expect(result).toEqual({ error: "Minimum salary cannot exceed maximum salary." });
  });

  it("rejects invalid WhatsApp, past expiry, and non-positive vacancies", () => {
    expect(validateJobInput({ ...validInput, contact_whatsapp: "abc" }, new Date("2026-07-21T00:00:00Z"))).toHaveProperty("error");
    expect(validateJobInput({ ...validInput, expires_at: "2026-07-20" }, new Date("2026-07-21T00:00:00Z"))).toHaveProperty("error");
    expect(validateJobInput({ ...validInput, number_of_vacancies: "0" }, new Date("2026-07-21T00:00:00Z"))).toHaveProperty("error");
  });

  it("accepts structured fields without accepting a restaurant id", () => {
    const result = validateJobInput(
      { ...validInput, restaurant_id: "spoofed-tenant" },
      new Date("2026-07-21T00:00:00Z")
    );
    expect(result).toHaveProperty("data");
    if ("data" in result) expect(result.data).not.toHaveProperty("restaurant_id");
  });
});

describe("job lifecycle", () => {
  it("allows the Phase 1 management transitions", () => {
    expect(isValidJobStatusTransition("draft", "published")).toBe(true);
    expect(isValidJobStatusTransition("published", "unpublished")).toBe(true);
    expect(isValidJobStatusTransition("published", "closed")).toBe(true);
    expect(isValidJobStatusTransition("expired", "published")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(isValidJobStatusTransition("draft", "closed")).toBe(false);
    expect(isValidJobStatusTransition("closed", "published")).toBe(false);
  });

  it("treats a published job past its UTC expiry as expired", () => {
    expect(effectiveJobStatus(
      { status: "published", expires_at: "2026-07-20T23:59:59Z" },
      new Date("2026-07-21T00:00:00Z")
    )).toBe("expired");
  });

  it("generates an encoded WhatsApp application link", () => {
    const url = buildWhatsAppApplicationUrl({
      title: "Tea Maker",
      restaurant_name: "Chai Xpress",
      contact_whatsapp: "971501234567"
    });
    expect(url).toMatch(/^https:\/\/wa\.me\/971501234567\?text=/);
    expect(decodeURIComponent(url)).toContain("Visa status:");
  });
});
