import { afterEach, describe, expect, it, vi } from "vitest";
import { printHtmlDocument } from "@/lib/print-ticket";

describe("printHtmlDocument", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attaches the completed ticket and prints it only once", () => {
    const focus = vi.fn();
    const print = vi.fn();
    const frameWindow = { focus, onafterprint: null, print };
    const iframe = {
      contentWindow: frameWindow,
      onload: null,
      remove: vi.fn(),
      setAttribute: vi.fn(),
      srcdoc: "",
      style: {}
    } as unknown as HTMLIFrameElement;
    const html = "<!doctype html><html><body>KOT</body></html>";
    const appendChild = vi.fn((node: HTMLIFrameElement) => {
      expect(node.srcdoc).toBe(html);
      (node.onload as (() => void) | null)?.();
      return node;
    });

    vi.stubGlobal("document", {
      body: { appendChild },
      createElement: vi.fn(() => iframe)
    });
    vi.stubGlobal("window", {
      setTimeout: vi.fn(() => 1)
    });

    printHtmlDocument(html);
    (iframe.onload as (() => void) | null)?.();

    expect(appendChild).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledOnce();
  });
});
