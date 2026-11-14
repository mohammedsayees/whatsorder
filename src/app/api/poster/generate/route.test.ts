import { beforeEach, describe, expect, it, vi } from "vitest";

const uploads: string[] = [];
const inserts: string[] = [];
const removedObjects: string[][] = [];
const deletedRows: { filters: unknown[][] }[] = [];
let rpcResult: { data: unknown; error: unknown } = { data: 0, error: null };
let rpcArgs: Record<string, unknown> | null = null;
let failInsertForVariant: number | null = null;
let slowVariant: number | null = null;
const renderedCtas: { qrDataUri: string | null }[] = [];
const renderedThemes: (string | undefined)[] = [];
const renderedFormats: string[] = [];
const renderedArt: { cutout: unknown; background: unknown }[] = [];
let artPlan: { status: string; kind: string; dataUri: string | null; start?: () => Promise<void> } | null = null;
const planCalls: unknown[] = [];
const scheduled: (() => unknown)[] = [];

vi.mock("@/lib/poster/art", () => ({
  planPosterArt: async (...args: unknown[]) => {
    planCalls.push(args[1]);
    return artPlan;
  }
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (task: () => unknown) => scheduled.push(task) };
});
const insertedThemes: (string | undefined)[] = [];
const qrUrls: string[] = [];

vi.mock("@/lib/store-share-assets", () => ({
  qrCodeDataUrl: async (url: string) => {
    qrUrls.push(url);
    return `data:image/png;base64,QR`;
  }
}));

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
    subject: { photoDataUri: "data:image/png;base64,PHOTO" },
    facts: {},
    art: { menuItemId: "item-1", imageUrl: "https://cdn/p.jpg", productName: "Karak", categoryName: "Tea", hasPhoto: true }
  }),
  buildPosterBranding: async () => ({ theme: "minimal_cafe" })
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
  renderPosterPng: async (input: {
    copy: { headline: string };
    cta?: { qrDataUri: string | null };
    branding?: { theme?: string };
    format?: string;
    language?: string;
    subject?: { cutoutDataUri?: unknown; backgroundDataUri?: unknown };
  }) => {
    renderedArt.push({ cutout: input.subject?.cutoutDataUri, background: input.subject?.backgroundDataUri });
    if (input.cta) renderedCtas.push(input.cta);
    renderedThemes.push(input.branding?.theme);
    renderedFormats.push(`${input.format}/${input.language}`);
    if (slowVariant !== null && input.copy.headline === `H${slowVariant}`) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return new Uint8Array([1, 2, 3]);
  }
}));

function postersTable() {
  const filters: unknown[][] = [];
  const builder: Record<string, unknown> = {
    insert: async (row: { id: string; copy: { variant_index: number; theme?: string } }) => {
      insertedThemes.push(row.copy.theme);
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

function request(extra: Record<string, unknown> = {}) {
  return new Request("https://app.test/api/poster/generate", {
    method: "POST",
    body: JSON.stringify({
      templateId: "bestseller",
      subjectRef: { menu_item_id: "item-1" },
      ...extra
    })
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  uploads.length = 0;
  renderedCtas.length = 0;
  renderedThemes.length = 0;
  renderedFormats.length = 0;
  renderedArt.length = 0;
  planCalls.length = 0;
  scheduled.length = 0;
  artPlan = { status: "none", kind: "cutout", dataUri: null };
  insertedThemes.length = 0;
  qrUrls.length = 0;
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
    // Each variant's poster carries a QR of its own tracked link.
    expect(renderedCtas).toHaveLength(3);
    expect(renderedCtas.every((cta) => cta.qrDataUri === "data:image/png;base64,QR")).toBe(true);
    expect(qrUrls.sort()).toEqual(
      payload.variants
        .map((variant) => `https://app.test/r/chaixpress?src=poster-${variant.posterId}`)
        .sort()
    );
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

  it("renders every variant in the restaurant's theme by default", async () => {
    await POST(request());
    expect(renderedThemes).toEqual(["minimal_cafe", "minimal_cafe", "minimal_cafe"]);
    expect(insertedThemes.sort()).toEqual(["minimal_cafe", "minimal_cafe", "minimal_cafe"]);
  });

  it("offers one variant per theme on request, starting with the default", async () => {
    const response = await POST(request({ themeMode: "mix" }));
    const payload = (await response.json()) as { variants: { theme: string; variantIndex: number }[] };
    const byIndex = [...payload.variants].sort((a, b) => a.variantIndex - b.variantIndex);
    expect(byIndex[0].theme).toBe("minimal_cafe");
    expect(new Set(byIndex.map((variant) => variant.theme)).size).toBe(3);
  });

  describe("AI artwork", () => {
    it("uses a ready cut-out in every variant", async () => {
      artPlan = { status: "ready", kind: "cutout", dataUri: "data:image/png;base64,CUT" };
      const response = await POST(request());
      expect(((await response.json()) as { art: string }).art).toBe("ready");
      expect(renderedArt.every((art) => art.cutout === "data:image/png;base64,CUT")).toBe(true);
      expect(scheduled).toHaveLength(0);
    });

    it("starts missing artwork after the response and renders this time without it", async () => {
      const start = vi.fn(async () => undefined);
      artPlan = { status: "preparing", kind: "cutout", dataUri: null, start };
      const response = await POST(request());
      expect(response.status).toBe(200);
      expect(((await response.json()) as { art: string }).art).toBe("preparing");
      expect(renderedArt.every((art) => !art.cutout && !art.background)).toBe(true);
      expect(start).not.toHaveBeenCalled();
      expect(scheduled).toHaveLength(1);
      await scheduled[0]();
      expect(start).toHaveBeenCalledTimes(1);
    });

    it("skips artwork entirely for text-only posters, and when the hourly limit blocks", async () => {
      await POST(request({ forceTypographic: true }));
      expect(planCalls).toHaveLength(0);
      rpcResult = { data: 600, error: null };
      await POST(request());
      expect(planCalls).toHaveLength(0);
    });

    it("never fails a generation because artwork planning failed", async () => {
      artPlan = null;
      const response = await POST(request());
      expect(response.status).toBe(200);
    });
  });

  it("renders the chosen format and language, defaulting unknown values to story / English", async () => {
    await POST(request({ format: "square", language: "ar" }));
    expect(renderedFormats).toEqual(["square/ar", "square/ar", "square/ar"]);
    renderedFormats.length = 0;
    await POST(request({ format: "billboard", language: "fr" }));
    expect(renderedFormats).toEqual(["story/en", "story/en", "story/en"]);
  });
});

