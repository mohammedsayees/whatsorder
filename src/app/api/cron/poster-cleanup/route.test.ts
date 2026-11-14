import { beforeEach, describe, expect, it, vi } from "vitest";

let rpcCalls: Record<string, unknown>[] = [];
let rpcResponses: { data: unknown; error: unknown }[] = [];
let removed: string[][] = [];

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    rpc: async (_name: string, args: Record<string, unknown>) => {
      rpcCalls.push(args);
      return rpcResponses.shift() ?? { data: [], error: null };
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          removed.push(paths);
          return { error: null };
        }
      })
    }
  })
}));

const { GET } = await import("./route");

function request(token = "secret") {
  return new Request("https://app.test/api/cron/poster-cleanup", {
    headers: { authorization: `Bearer ${token}` }
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = "secret";
  rpcCalls = [];
  rpcResponses = [];
  removed = [];
});

describe("poster retention cron", () => {
  it("rejects requests without the cron secret", async () => {
    expect((await GET(request("nope"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(request())).status).toBe(401);
    expect(rpcCalls).toHaveLength(0);
  });

  it("deletes expired never-sent posters after 30 days and removes their PNGs", async () => {
    rpcResponses = [
      {
        data: [
          { restaurant_id: "r1", storage_path: "r1/a.png" },
          { restaurant_id: "r2", storage_path: "r2/b.png" },
          // A path outside its own restaurant's prefix is never removed.
          { restaurant_id: "r1", storage_path: "r2/c.png" }
        ],
        error: null
      }
    ];
    const response = await GET(request());
    const payload = (await response.json()) as Record<string, unknown>;
    expect(rpcCalls).toEqual([{ older_than_days: 30, max_rows: 500 }]);
    expect(removed).toEqual([["r1/a.png", "r2/b.png"]]);
    expect(payload).toMatchObject({ ok: true, deleted: 3, objectsRemoved: 2 });
  });

  it("reports failure without removing anything when the delete fails", async () => {
    rpcResponses = [{ data: null, error: { code: "23503" } }];
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(removed).toHaveLength(0);
  });
});
