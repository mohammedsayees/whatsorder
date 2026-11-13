import { beforeEach, describe, expect, it, vi } from "vitest";

const uploads: string[] = [];
const inserts: string[] = [];
const removedObjects: string[][] = [];
const deletedRows: { filters: unknown[][] }[] = [];
let rpcResult: { data: unknown; error: unknown } = { data: 0, error: null };
let rpcArgs: Record<string, unknown> | null = null;
let failInsertForVariant: number | null = null;
let slowVariant: number | null = null;

vi.mock("@/lib/super-admin-auth", () => ({
  resolveRestaurantAdminSession: async () => ({
    session: {
      userId: "user-1",
      role: "owner",
      restaurantId: "rest-1",
      restaurant: { id: "rest-1", name: "Chai Xpress", slug: "chaixpress" }
    }
  })
}));

vi.mock("@/lib/poster/subjects", () => ({
  buildPosterSubjectBundle: async () => ({
    subject: { photoDataUri: null },
    facts: {}
  }),
  buildPosterBranding: async () => ({})
}));

vi.mock("@/lib/poster/copy", () => ({
  generateCopyVariants: async () =>
    [0, 1, 2].map((index) => ({
      headline: `H${index}`,
      subline: "S",
      caption: "C"
    }))
}));

vi.mock("@/lib/poster/render", () => ({
  renderPosterPng: async (input: { copy: { headline: string } }) => {
    if (slowVariant !== null && input.copy.headline === `H${slowVariant}`) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return new Uint8Array([1, 2, 3]);
  }
}));

function postersTable() {
  const filters: unknown[][] = [];
  const builder: Record<string, unknown> = {
    insert: async (row: { id: string; copy: { variant_index: number } }) => {
      if (row.copy.variant_index === failInsertForVariant) {
        return { error: { message: "boom" } };
      }
      inserts.push(row.id);
      return { error: null };
    },
    delete: () => {
      deletedRows.push({ filters });
      return builder;
    },
    eq: (...args: unknown[]) => {
      filters.push(["eq", ...args]);
      return builder;
    },
    in: (...args: unknown[]) => {
      filters.push(["in", ...args]);
      return Promise.resolve({ error: null });
    }
  };
  return builder;
}

const admin = {
  rpc: async (_name: string, args: Record<string, unknown>) => {
    rpcArgs = args;
    return rpcResult;
  },
  from: () => postersTable(),
  storage: {
    from: () => ({
      upload: async (path: string) => {
        uploads.push(path);
        return { error: null };
      },
      createSignedUrl: async (path: string) => ({
        data: { signedUrl: `https://signed/${path}` },
        error: null
      }),
      remove: async (paths: string[]) => {
        removedObjects.push(paths);
        return { error: null };
      }
    })
  }
};

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => admin }));

const { POST } = await import("./route");

function request() {
  return new Request("https://app.test/api/poster/generate", {
    method: "POST",
    body: JSON.stringify({
      templateId: "bestseller",
      subjectRef: { menu_item_id: "item-1" }
    })
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  uploads.length = 0;
  inserts.length = 0;
  removedObjects.length = 0;
  deletedRows.length = 0;
  rpcResult = { data: 0, error: null };
  rpcArgs = null;
  failInsertForVariant = null;
  slowVariant = null;
});

describe("POST /api/poster/generate", () => {
  it("returns three variants when allowed, and records the attempt per restaurant", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      variants: { posterId: string; shareCaption: string }[];
    };
    expect(payload.variants).toHaveLength(3);
    for (const variant of payload.variants) {
      expect(variant.shareCaption).toBe(
        `C\n\nhttps://app.test/r/chaixpress?src=poster-${variant.posterId}`
      );
    }
    expect(rpcArgs).toEqual({
      target_restaurant_id: "rest-1",
      target_user_id: "user-1",
      max_attempts: 10,
      window_seconds: 3600
    });
    expect(removedObjects).toHaveLength(0);
    expect(deletedRows).toHaveLength(0);
  });

  it("returns 429 with a clear message once the hourly limit is reached", async () => {
    rpcResult = { data: 1500, error: null };
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("1500");
    const payload = (await response.json()) as { error: string; code: string };
    expect(payload.code).toBe("rate_limited");
    expect(payload.error).toContain("25 minutes");
    expect(uploads).toHaveLength(0);
  });

  it("fails closed when the limit can't be checked", async () => {
    rpcResult = { data: null, error: { code: "500" } };
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(uploads).toHaveLength(0);
  });

  it("removes every row and object created when one variant fails", async () => {
    failInsertForVariant = 1;
    slowVariant = 2; // finishes after the failure: must still be cleaned up
    const response = await POST(request());
    expect(response.status).toBe(500);

    expect(uploads).toHaveLength(3);
    expect(removedObjects).toEqual([expect.arrayContaining(uploads)]);
    expect(removedObjects[0]).toHaveLength(3);
    expect(removedObjects[0].every((path) => path.startsWith("rest-1/"))).toBe(true);

    expect(deletedRows).toHaveLength(1);
    const filters = deletedRows[0].filters;
    expect(filters).toContainEqual(["eq", "restaurant_id", "rest-1"]);
    expect(filters).toContainEqual(["eq", "status", "rendered"]);
    const idFilter = filters.find((filter) => filter[0] === "in") as [string, string, string[]];
    // Every id an insert was attempted for, including the failed one.
    expect(idFilter[2]).toHaveLength(3);
    expect(idFilter[2]).toEqual(expect.arrayContaining(inserts));
  });
});
