import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { method: string; args: unknown[] }[] = [];
let result: { data: unknown; error: unknown } | Error = { data: [], error: null };
let adminAvailable = true;

function query() {
  const builder: Record<string, unknown> = {};
  for (const method of ["from", "select", "eq", "in", "order", "limit"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.abortSignal = (...args: unknown[]) => {
    calls.push({ method: "abortSignal", args });
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (adminAvailable ? query() : null)
}));

const { getPrebuildRestaurantSlugs, PREBUILD_MENU_LIMIT } = await import("./prebuild-menus");

describe("menu pre-render slugs", () => {
  beforeEach(() => {
    calls.length = 0;
    result = { data: [], error: null };
    adminAvailable = true;
  });

  it("asks only for public restaurants, bounded and with a timeout", async () => {
    result = { data: [{ slug: "chaixpress" }, { slug: "karak-house" }], error: null };
    expect(await getPrebuildRestaurantSlugs()).toEqual(["chaixpress", "karak-house"]);
    expect(calls).toEqual(expect.arrayContaining([
      { method: "from", args: ["restaurants"] },
      { method: "select", args: ["slug"] },
      { method: "eq", args: ["is_active", true] },
      { method: "in", args: ["status", ["live", "trial", "paid"]] },
      { method: "limit", args: [PREBUILD_MENU_LIMIT] }
    ]));
    expect(calls.at(-1)?.method).toBe("abortSignal");
    expect(calls.at(-1)?.args[0]).toBeInstanceOf(AbortSignal);
  });

  it("drops slugs a store link could not have", async () => {
    result = {
      data: [{ slug: "ok-shop" }, { slug: "Bad Slug" }, { slug: "" }, { slug: null }, { slug: "../x" }],
      error: null
    };
    expect(await getPrebuildRestaurantSlugs()).toEqual(["ok-shop"]);
  });

  it("never fails the build: no admin, a query error or a timeout all give []", async () => {
    adminAvailable = false;
    expect(await getPrebuildRestaurantSlugs()).toEqual([]);
    adminAvailable = true;
    result = { data: null, error: { message: "boom" } };
    expect(await getPrebuildRestaurantSlugs()).toEqual([]);
    result = new Error("The operation was aborted due to timeout");
    expect(await getPrebuildRestaurantSlugs()).toEqual([]);
  });

  it("keeps the menu page edge-cached while pre-rendering known slugs", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/r/[restaurantSlug]/page.tsx"), "utf8");
    expect(page).toContain('export const dynamic = "force-static"');
    expect(page).toContain("export const dynamicParams = true");
    expect(page).toContain("export async function generateStaticParams()");
    expect(page).toContain("getPrebuildRestaurantSlugs()");
  });
});
