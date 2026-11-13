import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: unknown[][] = [];
let removedPaths: string[] = [];

function builder() {
  const chain: Record<string, unknown> = {
    delete: () => {
      calls.push(["delete"]);
      return chain;
    },
    select: () => chain,
    eq: (...args: unknown[]) => {
      calls.push(["eq", ...args]);
      return chain;
    },
    in: (...args: unknown[]) => {
      calls.push(["in", ...args]);
      return Promise.resolve({
        data: [{ id: "p1", template_id: "offer", storage_path: "rest-1/p1.png" }],
        error: null
      });
    }
  };
  return chain;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => builder(),
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          removedPaths = paths;
          return { error: null };
        },
        createSignedUrl: async (path: string, ttl: number, options?: { download?: string }) => ({
          data: { signedUrl: `https://signed/${path}?ttl=${ttl}${options?.download ? `&dl=${options.download}` : ""}` },
          error: null
        })
      })
    }
  })
}));

const { discardPosterArtifacts, getFreshPosterUrls } = await import("./store");

beforeEach(() => {
  calls.length = 0;
  removedPaths = [];
});

describe("discardPosterArtifacts", () => {
  it("deletes only this restaurant's rendered rows and objects under its prefix", async () => {
    await discardPosterArtifacts("rest-1", {
      posterIds: ["p1", "p2"],
      storagePaths: ["rest-1/p1.png", "rest-2/evil.png"]
    });
    expect(calls).toContainEqual(["eq", "restaurant_id", "rest-1"]);
    expect(calls).toContainEqual(["eq", "status", "rendered"]);
    expect(calls).toContainEqual(["in", "id", ["p1", "p2"]]);
    expect(removedPaths).toEqual(["rest-1/p1.png"]);
  });
});

describe("getFreshPosterUrls", () => {
  it("signs fresh preview and download URLs for this restaurant's posters", async () => {
    await expect(getFreshPosterUrls("rest-1", ["p1"])).resolves.toEqual([
      {
        posterId: "p1",
        previewUrl: "https://signed/rest-1/p1.png?ttl=3600",
        downloadUrl: "https://signed/rest-1/p1.png?ttl=3600&dl=offer-poster.png"
      }
    ]);
    expect(calls).toContainEqual(["eq", "restaurant_id", "rest-1"]);
  });

  it("does nothing for an empty list", async () => {
    await expect(getFreshPosterUrls("rest-1", [])).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
