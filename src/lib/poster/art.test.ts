import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POSTER_ART_DAILY_LIMIT, isClaimable, planPosterArt } from "./art";

// ── in-memory Supabase double (only what art.ts uses) ────────────────────────
type Row = Record<string, unknown>;
let posterArt: Row[] = [];
let generations: Row[] = [];
let usageCount: number | null = 0;
let usageError = false;
const files = new Map<string, Buffer>();

function query(table: string) {
  const filters: [string, string, unknown][] = [];
  let mode: "select" | "update" | "insert" = "select";
  let patch: Row = {};
  let head = false;
  const match = (row: Row) =>
    filters.every(([op, key, value]) =>
      op === "eq" ? row[key] === value : op === "in" ? (value as unknown[]).includes(row[key]) : op === "neq" ? row[key] !== value : true
    );
  const builder: Record<string, unknown> = {
    select: (_cols?: string, opts?: { head?: boolean }) => {
      head = Boolean(opts?.head);
      return builder;
    },
    eq: (key: string, value: unknown) => (filters.push(["eq", key, value]), builder),
    neq: (key: string, value: unknown) => (filters.push(["neq", key, value]), builder),
    in: (key: string, value: unknown) => (filters.push(["in", key, value]), builder),
    gte: () => builder,
    insert: (row: Row) => {
      if (table === "ai_image_generations") {
        generations.push(row);
        return Promise.resolve({ error: null });
      }
      const exists = posterArt.some((r) => r.restaurant_id === row.restaurant_id && r.menu_item_id === row.menu_item_id && r.kind === row.kind);
      if (exists) return Promise.resolve({ error: { code: "23505" } });
      posterArt.push({ id: `art-${posterArt.length + 1}`, ...row });
      return Promise.resolve({ error: null });
    },
    update: (values: Row) => {
      mode = "update";
      patch = values;
      return builder;
    },
    maybeSingle: async () => ({ data: posterArt.find(match) ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown) => {
      if (table === "ai_image_generations" && head) {
        return Promise.resolve(usageError ? { count: null, error: { code: "500" } } : { count: usageCount, error: null }).then(resolve);
      }
      if (mode === "update") {
        const hits = posterArt.filter(match);
        hits.forEach((row) => Object.assign(row, patch));
        return Promise.resolve({ data: hits.map((row) => ({ id: row.id })), error: null }).then(resolve);
      }
      return Promise.resolve({ data: posterArt.filter(match), error: null }).then(resolve);
    }
  };
  void mode;
  return builder;
}

const admin = {
  from: (table: string) => query(table),
  storage: {
    from: () => ({
      upload: async (path: string, body: Buffer) => {
        files.set(path, body);
        return { error: null };
      },
      download: async (path: string) => {
        const file = files.get(path);
        return file ? { data: new Blob([new Uint8Array(file)]), error: null } : { data: null, error: { message: "missing" } };
      }
    })
  }
} as never;

const art = {
  menuItemId: "item-1",
  imageUrl: "https://cdn.test/karak.jpg",
  productName: "Karak Chai Special AED 3",
  categoryName: "Tea",
  hasPhoto: true
};

async function magentaDish() {
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#ff00ff"/><ellipse cx="300" cy="320" rx="200" ry="120" fill="#a0592a"/></svg>`
    )
  )
    .png()
    .toBuffer();
}

beforeEach(() => {
  posterArt = [];
  generations = [];
  usageCount = 0;
  usageError = false;
  files.clear();
});

describe("isClaimable", () => {
  const now = Date.parse("2026-11-13T12:00:00Z");
  const row = (status: string, minutesAgo: number, source: string | null = "a") =>
    ({ id: "r", status, source_image_url: source, storage_path: "p", updated_at: new Date(now - minutesAgo * 60_000).toISOString() }) as never;

  it("retries stuck jobs, waits out recent failures, and redoes cut-outs of changed photos", () => {
    expect(isClaimable(row("preparing", 1), "a", now)).toBe(false);
    expect(isClaimable(row("preparing", 10), "a", now)).toBe(true);
    expect(isClaimable(row("failed", 60), "a", now)).toBe(false);
    expect(isClaimable(row("failed", 7 * 60), "a", now)).toBe(true);
    expect(isClaimable(row("ready", 1), "a", now)).toBe(false);
    expect(isClaimable(row("ready", 1), "b", now)).toBe(true);
  });
});

describe("planPosterArt", () => {
  it("claims the job, then generates, keys out, stores and logs a cut-out — without names or prices", async () => {
    const generate = vi.fn(async () => ({ imageBuffer: await magentaDish(), mimeType: "image/png", model: "gemini-test" }));
    const plan = await planPosterArt(admin, { restaurantId: "rest-1", userId: "user-1", art }, {
      generate,
      fetchSource: async () => magentaDish()
    });
    expect(plan.status).toBe("preparing");
    expect(plan.start).toBeDefined();
    expect(posterArt[0]).toMatchObject({ status: "preparing", kind: "cutout", source_image_url: art.imageUrl });

    await plan.start!();
    expect(posterArt[0]).toMatchObject({ status: "ready", storage_path: "rest-1/art/item-1-cutout.png" });
    expect(files.has("rest-1/art/item-1-cutout.png")).toBe(true);
    expect(generations).toEqual([
      expect.objectContaining({ restaurant_id: "rest-1", purpose: "poster_cutout", status: "generated", created_by: "user-1" })
    ]);
    const call = generate.mock.calls[0] as unknown as [{ prompt: string; inputImage?: unknown }];
    expect(call[0].inputImage).toBeDefined();
    expect(call[0].prompt).not.toMatch(/karak|AED|chai|\d+(\.\d+)?\s*(AED|dhs)/i);

    // Next generation uses the cached file.
    const again = await planPosterArt(admin, { restaurantId: "rest-1", userId: "user-1", art }, { generate });
    expect(again.status).toBe("ready");
    expect(again.dataUri).toMatch(/^data:image\/png;base64,/);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("makes a background (no photo, no input image) for photo-less items", async () => {
    const generate = vi.fn(async () => ({
      imageBuffer: await sharp({ create: { width: 500, height: 500, channels: 3, background: { r: 60, g: 40, b: 20 } } }).png().toBuffer(),
      mimeType: "image/png",
      model: "gemini-test"
    }));
    const plan = await planPosterArt(admin, { restaurantId: "rest-1", userId: "user-1", art: { ...art, hasPhoto: false, imageUrl: null } }, { generate });
    await plan.start!();
    expect(plan.kind).toBe("background");
    expect(posterArt[0]).toMatchObject({ kind: "background", status: "ready" });
    const call = generate.mock.calls[0] as unknown as [{ prompt: string; inputImage?: unknown }];
    expect(call[0].inputImage).toBeUndefined();
    expect(call[0].prompt).toMatch(/tea and coffee/);
    expect(call[0].prompt).not.toMatch(/karak|AED|chai/i);
  });

  it("stops at the daily cap, and fails closed when usage can't be read", async () => {
    const generate = vi.fn();
    usageCount = POSTER_ART_DAILY_LIMIT;
    expect((await planPosterArt(admin, { restaurantId: "rest-1", userId: "u", art }, { generate })).status).toBe("limit");
    usageCount = 0;
    usageError = true;
    expect((await planPosterArt(admin, { restaurantId: "rest-1", userId: "u", art }, { generate })).status).toBe("limit");
    expect(posterArt).toHaveLength(0);
    expect(generate).not.toHaveBeenCalled();
  });

  it("lets only one request claim a job", async () => {
    const generate = vi.fn();
    const first = await planPosterArt(admin, { restaurantId: "rest-1", userId: "u", art }, { generate });
    const second = await planPosterArt(admin, { restaurantId: "rest-1", userId: "u", art }, { generate });
    expect(first.start).toBeDefined();
    expect(second.status).toBe("preparing");
    expect(second.start).toBeUndefined();
  });

  it("records failures (and rejected cut-outs) and falls back", async () => {
    const failing = vi.fn(async () => {
      throw new Error("REQUEST_FAILED:503");
    });
    const plan = await planPosterArt(admin, { restaurantId: "rest-1", userId: "u", art }, { generate: failing, fetchSource: async () => magentaDish() });
    await plan.start!();
    expect(posterArt[0]).toMatchObject({ status: "failed" });
    expect(generations[0]).toMatchObject({ status: "failed", purpose: "poster_cutout" });

    posterArt = [];
    generations = [];
    const whiteBackground = vi.fn(async () => ({
      imageBuffer: await sharp({ create: { width: 500, height: 500, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer(),
      mimeType: "image/png",
      model: "gemini-test"
    }));
    const rejected = await planPosterArt(admin, { restaurantId: "rest-1", userId: "u", art }, { generate: whiteBackground, fetchSource: async () => magentaDish() });
    await rejected.start!();
    expect(posterArt[0]).toMatchObject({ status: "failed", error: "rejected:background_not_key_colour" });
    // The model call was billed, so it counts toward the cap.
    expect(generations[0]).toMatchObject({ status: "generated" });
  });

  it("does nothing when the image model isn't configured", async () => {
    const saved = { gemini: process.env.GEMINI_API_KEY, google: process.env.GOOGLE_AI_API_KEY };
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    try {
      expect((await planPosterArt(admin, { restaurantId: "rest-1", userId: "u", art })).status).toBe("none");
      expect(posterArt).toHaveLength(0);
    } finally {
      if (saved.gemini) process.env.GEMINI_API_KEY = saved.gemini;
      if (saved.google) process.env.GOOGLE_AI_API_KEY = saved.google;
    }
  });
});
