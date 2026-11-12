import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAINTENANCE_BYPASS_COOKIE,
  maintenanceBypassSecret,
  maintenanceRewrites
} from "./maintenance-config";

const SECRET = "opsBypassSecret0123456789abcdefXYZ";

function matcher() {
  const [rule] = maintenanceRewrites({ MAINTENANCE_MODE: "true" });
  // Same pattern Next compiles from `/:path(<regex>)`.
  const inner = rule.source.slice("/:path(".length, -1);
  return new RegExp(`^/(${inner})$`);
}

describe("maintenance switch config", () => {
  it("adds no rewrite unless MAINTENANCE_MODE is exactly true", () => {
    expect(maintenanceRewrites({})).toEqual([]);
    expect(maintenanceRewrites({ MAINTENANCE_MODE: "1" })).toEqual([]);
    expect(maintenanceRewrites({ MAINTENANCE_MODE: "false" })).toEqual([]);
    expect(maintenanceRewrites({ MAINTENANCE_MODE: "true" })).toHaveLength(1);
  });

  it("rewrites every app path but leaves Next assets and the maintenance routes alone", () => {
    const re = matcher();
    for (const path of ["/", "/r/chaixpress", "/admin/finance", "/api/whatsapp/webhook", "/api/cron/billing", "/robots.txt"]) {
      expect(re.test(path), path).toBe(true);
    }
    for (const path of ["/_next/static/chunks/app.js", "/api/maintenance", "/api/maintenance/bypass"]) {
      expect(re.test(path), path).toBe(false);
    }
    expect(re.test("/api/maintenance-other")).toBe(true);
  });

  it("only offers a bypass for a long, regex-safe secret", () => {
    expect(maintenanceBypassSecret({ MAINTENANCE_BYPASS_SECRET: SECRET })).toBe(SECRET);
    expect(maintenanceBypassSecret({ MAINTENANCE_BYPASS_SECRET: "short" })).toBeNull();
    expect(maintenanceBypassSecret({ MAINTENANCE_BYPASS_SECRET: `${SECRET}.*` })).toBeNull();
    expect(maintenanceRewrites({ MAINTENANCE_MODE: "true", MAINTENANCE_BYPASS_SECRET: "short" })[0])
      .not.toHaveProperty("missing");
    expect(maintenanceRewrites({ MAINTENANCE_MODE: "true", MAINTENANCE_BYPASS_SECRET: SECRET })[0].missing)
      .toEqual([{ type: "cookie", key: MAINTENANCE_BYPASS_COOKIE, value: `^${SECRET}$` }]);
  });
});

describe("maintenance routes", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("answers 503 with Retry-After while on, and 404 while off", async () => {
    const { GET, POST } = await import("@/app/api/maintenance/route");
    vi.stubEnv("MAINTENANCE_MODE", "true");
    const page = GET(new Request("http://x/", { headers: { accept: "text/html" } }));
    expect(page.status).toBe(503);
    expect(page.headers.get("retry-after")).toBe("600");
    expect(await page.text()).toContain("Back in a few minutes");
    const webhook = POST(new Request("http://x/api/whatsapp/webhook", { method: "POST" }));
    expect(webhook.status).toBe(503);
    expect(await webhook.json()).toEqual({ error: "maintenance" });
    vi.stubEnv("MAINTENANCE_MODE", "false");
    expect(GET(new Request("http://x/")).status).toBe(404);
  });

  it("sets the bypass cookie only for the exact secret while on", async () => {
    const { GET } = await import("@/app/api/maintenance/bypass/route");
    vi.stubEnv("MAINTENANCE_MODE", "true");
    vi.stubEnv("MAINTENANCE_BYPASS_SECRET", SECRET);
    expect((await GET(new Request("http://x/api/maintenance/bypass?token=wrong"))).status).toBe(404);
    expect((await GET(new Request(`http://x/api/maintenance/bypass?token=${SECRET}x`))).status).toBe(404);
    const ok = await GET(new Request(`http://x/api/maintenance/bypass?token=${SECRET}`));
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("http://x/admin");
    expect(ok.headers.get("set-cookie")).toMatch(new RegExp(`${MAINTENANCE_BYPASS_COOKIE}=${SECRET};.*HttpOnly`, "i"));
    vi.stubEnv("MAINTENANCE_MODE", "false");
    expect((await GET(new Request(`http://x/api/maintenance/bypass?token=${SECRET}`))).status).toBe(404);
  });
});
