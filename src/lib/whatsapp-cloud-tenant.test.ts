import { afterEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })
  })
}));

const {
  cloudNumberOwnerSlug,
  isPlatformCloudPhoneNumberId,
  restaurantOwnsCloudNumber
} = await import("./whatsapp-cloud-tenant");

afterEach(() => {
  vi.unstubAllEnvs();
  maybeSingle.mockReset();
});

describe("isPlatformCloudPhoneNumberId", () => {
  it("matches only the configured number", () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "111");
    expect(isPlatformCloudPhoneNumberId("111")).toBe(true);
    expect(isPlatformCloudPhoneNumberId("222")).toBe(false);
    expect(isPlatformCloudPhoneNumberId(undefined)).toBe(false);
  });

  it("drops everything when no number is configured", () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "");
    expect(isPlatformCloudPhoneNumberId("")).toBe(false);
    expect(isPlatformCloudPhoneNumberId("111")).toBe(false);
  });
});

describe("cloud number owner", () => {
  it("prefers the explicit owner slug", () => {
    vi.stubEnv("WHATSAPP_CLOUD_OWNER_SLUG", "owner-cafe");
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG", "default-cafe");
    expect(cloudNumberOwnerSlug()).toBe("owner-cafe");
  });

  it("lets only the owner restaurant send", async () => {
    vi.stubEnv("WHATSAPP_CLOUD_OWNER_SLUG", "owner-cafe");
    maybeSingle.mockResolvedValueOnce({ data: { slug: "owner-cafe" }, error: null });
    expect(await restaurantOwnsCloudNumber("r1")).toBe(true);
    maybeSingle.mockResolvedValueOnce({ data: { slug: "second-cafe" }, error: null });
    expect(await restaurantOwnsCloudNumber("r2")).toBe(false);
  });

  it("fails closed on lookup errors", async () => {
    vi.stubEnv("WHATSAPP_CLOUD_OWNER_SLUG", "owner-cafe");
    maybeSingle.mockResolvedValueOnce({ data: null, error: { code: "500" } });
    expect(await restaurantOwnsCloudNumber("r1")).toBe(false);
  });
});
