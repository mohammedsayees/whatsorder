import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const download = vi.fn();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    rpc,
    storage: { from: () => ({ download }) },
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({
        single: async () => ({ data: { storage_path: "r/doc.webp", mime_type: "image/webp" }, error: null })
      }) }) })
    })
  })
}));

const { processFinanceExtractionJob } = await import("./finance-extraction");

const uploaded = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/webp" };
const extraction = {
  supplier_name: "Supplier", invoice_number: "INV-1", invoice_date: "2026-11-12",
  currency: "AED", subtotal: "10.00", vat: "0.50", total: "10.50", vat_inclusive: false,
  confidence: "high", warnings: [],
  lines: [{ description: "Tea", quantity: "1", unit: "kg", unit_price: "10.00",
    amount: "10.00", tax: "0.50", classification: "purchase" }]
};
const geminiOk = () => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify(extraction) }] } }]
}), { status: 200 });

function rpcCalls(name: string) {
  return rpc.mock.calls.filter(([called]) => called === name);
}

describe("finance bill extraction job", () => {
  let now = 1_800_000_000_000;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    rpc.mockReset();
    download.mockReset();
    rpc.mockImplementation(async (name: string) => ({
      data: name === "claim_finance_extraction_job" ? { id: "job" } : name === "complete_finance_extraction_job" ? true : null,
      error: null
    }));
    vi.spyOn(Date, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });

  it("reads uploaded bytes directly instead of re-downloading them from storage", async () => {
    const fetchMock = vi.fn(async () => geminiOk());
    vi.stubGlobal("fetch", fetchMock);
    const result = await processFinanceExtractionJob("restaurant", "doc", uploaded);
    expect(result).toEqual({ ok: true });
    expect(download).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rpcCalls("complete_finance_extraction_job")).toHaveLength(1);
  });

  it("still downloads from storage when retrying without uploaded bytes", async () => {
    download.mockResolvedValue({ data: new Blob([new Uint8Array([1])]), error: null });
    vi.stubGlobal("fetch", vi.fn(async () => geminiOk()));
    expect(await processFinanceExtractionJob("restaurant", "doc")).toEqual({ ok: true });
    expect(download).toHaveBeenCalledWith("r/doc.webp");
  });

  it("does not start a retry once the shared Gemini budget is spent", async () => {
    const fetchMock = vi.fn(async () => {
      now += 44_000; // first attempt hangs for most of the 45s budget, then fails
      throw new Error("timeout");
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await processFinanceExtractionJob("restaurant", "doc", uploaded);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, error: "extraction_failed" });
    expect(rpcCalls("fail_finance_extraction_job")).toHaveLength(1);
  });

  it("caps the retry's timeout to what is left of the budget", async () => {
    const timeouts: number[] = [];
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    timeoutSpy.mockImplementation((ms: number) => {
      timeouts.push(ms);
      return new AbortController().signal;
    });
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        now += 30_000;
        throw new Error("network");
      }
      return geminiOk();
    }));
    expect(await processFinanceExtractionJob("restaurant", "doc", uploaded)).toEqual({ ok: true });
    expect(timeouts).toEqual([45_000, 15_000]);
  });

  it("reports a busy provider when a 429 leaves no budget for a retry", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      vi.stubGlobal("fetch", vi.fn(async () => {
        now += 42_000;
        return new Response("{}", { status: 429 });
      }));
      const pending = processFinanceExtractionJob("restaurant", "doc", uploaded);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await pending).toEqual({ ok: false, error: "provider_busy" });
    } finally {
      vi.useRealTimers();
    }
  });
});
