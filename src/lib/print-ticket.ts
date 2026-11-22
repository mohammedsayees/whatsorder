// Browser-only helper: prints a full HTML document through a hidden iframe so
// the print dialog never navigates away from the current screen. Shared by the
// orders list and the staff punch screen. The HTML is built by
// "@/lib/order-print".

const CSS_PX_PER_MM = 96 / 25.4;

export type PrintHtmlOptions = {
  /**
   * Print the whole document as one page this many millimetres wide, sized
   * to the content's height. Browsers ignore `@page { size: 80mm auto }` and
   * paginate long receipts at a default page height (A4), so a thermal
   * printer cuts them into several slips. Measuring the rendered content and
   * setting an exact page height keeps it to one continuous slip.
   */
  singlePageWidthMm?: number;
};

/** Sets the frame's page to `widthMm` wide and exactly as tall as its content. */
export function fitPageToContent(frameDocument: Document, widthMm: number) {
  const body = frameDocument.body;
  if (!body) {
    return;
  }
  const heightPx = Math.max(
    body.getBoundingClientRect().height,
    body.scrollHeight,
    frameDocument.documentElement.scrollHeight
  );
  if (!Number.isFinite(heightPx) || heightPx <= 0) {
    return;
  }
  // A few millimetres of slack so rounding never spills onto a second page.
  const heightMm = Math.ceil(heightPx / CSS_PX_PER_MM) + 4;
  const style = frameDocument.createElement("style");
  style.textContent = `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }`;
  frameDocument.head.appendChild(style);
}

export function printHtmlDocument(
  html: string,
  onError?: (message: string) => void,
  options: PrintHtmlOptions = {}
) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";

  let cleanedUp = false;
  let printStarted = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    // Defer removal so the print job has the document while spooling.
    window.setTimeout(() => {
      iframe.remove();
    }, 1000);
  };

  iframe.onload = () => {
    // Some browsers can dispatch more than one load event while preparing an
    // iframe. Never allow that to create a duplicate (or blank) print job.
    if (printStarted) {
      return;
    }
    printStarted = true;

    const frameWindow = iframe.contentWindow;
    if (!frameWindow) {
      onError?.("Unable to render the print preview. Please try again.");
      cleanup();
      return;
    }

    if (options.singlePageWidthMm) {
      try {
        fitPageToContent(frameWindow.document, options.singlePageWidthMm);
      } catch {
        // Fall back to the document's own @page rule; it still prints.
      }
    }

    // Remove the iframe once the dialog closes (whether printed or cancelled).
    frameWindow.onafterprint = cleanup;
    frameWindow.focus();
    frameWindow.print();

    // Fallback cleanup for browsers that never fire onafterprint.
    window.setTimeout(cleanup, 60_000);
  };

  // Set the complete document before attaching the iframe. Appending an empty
  // iframe and then document.write()-ing into it can produce two load events:
  // one for about:blank and one for the ticket. In kiosk-printing mode that can
  // become a blank print followed by the real ticket.
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}
