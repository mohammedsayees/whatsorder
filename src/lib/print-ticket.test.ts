import { afterEach, describe, expect, it, vi } from "vitest";
import { fitPageToContent, printHtmlDocument } from "@/lib/print-ticket";

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

  it("sizes the page to the content so a long receipt prints as one slip", () => {
    const appended: { textContent: string }[] = [];
    const frameDocument = {
      body: { getBoundingClientRect: () => ({ height: 1700 }), scrollHeight: 1690 },
      documentElement: { scrollHeight: 1600 },
      createElement: () => ({ textContent: "" }),
      head: { appendChild: (node: { textContent: string }) => appended.push(node) }
    } as unknown as Document;

    fitPageToContent(frameDocument, 80);

    // 1700 CSS px = 449.8 mm, rounded up, plus 4 mm slack.
    expect(appended).toHaveLength(1);
    expect(appended[0].textContent).toBe("@page { size: 80mm 454mm; margin: 0; }");
  });
});
