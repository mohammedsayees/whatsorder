// Browser-only helper: prints a full HTML document through a hidden iframe so
// the print dialog never navigates away from the current screen. Shared by the
// orders list and the staff punch screen. The HTML is built by
// "@/lib/order-print".

export function printHtmlDocument(
  html: string,
  onError?: (message: string) => void
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
    const frameWindow = iframe.contentWindow;
    if (!frameWindow) {
      onError?.("Unable to render the print preview. Please try again.");
      cleanup();
      return;
    }

    // Remove the iframe once the dialog closes (whether printed or cancelled).
    frameWindow.onafterprint = cleanup;
    frameWindow.focus();
    frameWindow.print();

    // Fallback cleanup for browsers that never fire onafterprint.
    window.setTimeout(cleanup, 60_000);
  };

  document.body.appendChild(iframe);

  const frameDocument = iframe.contentWindow?.document;
  if (!frameDocument) {
    onError?.("Unable to render the print preview. Please try again.");
    iframe.remove();
    return;
  }

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();
}
