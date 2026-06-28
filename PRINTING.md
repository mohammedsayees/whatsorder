# Printing — KOT & Receipts

How order printing works in WhatsOrder, and how to set up silent (no-dialog) printing for an in-store device.

## How it works in the app

Staff print from the admin order view via the buttons rendered by
[`OrderPrintActions`](src/components/admin/OrderPrintActions.tsx):

- **Print KOT** — kitchen copy, prices hidden. Enabled once the order is accepted (not `New`/`Cancelled`).
- **Print Receipt** — customer copy with prices and totals.
- **Print Both** — KOT + receipt, one per page.

Tickets are styled for an **80mm thermal roll** (`@page { size: 80mm auto }`, 72mm body width).
Each print is logged via `recordOrderPrintEventsAction`; reprints are tracked per device in
`localStorage` and shown as "Reprint …".

### Rendering mechanism (hidden iframe)

Printing renders the ticket HTML into an **off-screen `<iframe>`** inside the current page, waits
for its `load` event, then calls `iframe.contentWindow.print()`. This means:

- **No second tab/window** opens.
- The native print dialog appears on the **first click** (no manual Ctrl+P).
- Pop-up blockers don't apply (nothing is opened).
- The iframe is removed on `onafterprint` (with a 60s fallback for browsers that don't fire it).

The browser's native print dialog (choose printer / Print / Cancel) **still appears each time** —
that is unavoidable in standard web printing. To remove the dialog too, use kiosk printing below.

## Silent printing (kiosk mode) — optional, per device

Chrome's `--kiosk-printing` flag sends every print straight to the **default printer** with no
dialog. It's a launch flag on the Chrome shortcut — **no code change required**.

### Prerequisites (all platforms)

1. Install the thermal printer and set it as the **system default printer** (kiosk printing always
   uses the default — there is no printer picker).
2. Set that printer's default paper to your roll size (80mm / 72mm) and margins; you won't get a
   dialog to adjust per print.
3. Use a **dedicated in-store device / Chrome profile**. The flag is global to that Chrome instance —
   *every* print becomes silent. Do not enable it on a staff member's personal machine.

### Windows (typical in-store PC)

1. Right-click the Chrome shortcut → **Properties**.
2. In **Target**, append the flag after the quotes:
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing
   ```
3. Click OK and always launch Chrome from that shortcut.
4. (Optional full kiosk) also append `--kiosk https://YOUR-APP-URL/admin/orders` to open the orders
   page full-screen.

### macOS

Chrome on Mac doesn't read flags from the dock icon. Fully quit Chrome first, then launch from
Terminal (or wrap this in an Automator "Application"):
```
open -a "Google Chrome" --args --kiosk-printing
```

### Android / iOS tablets

Mobile Chrome **does not support launch flags**, so `--kiosk-printing` won't work. Options:
- Use a Windows mini-PC or a kiosk-browser app that supports silent printing, or
- Keep the default behaviour (one tap + the system print sheet).

### Verify

Launch via the modified shortcut, open an order, click **Print KOT** — it should print immediately
with **no dialog**. If the dialog still appears, Chrome was already running without the flag (fully
quit and relaunch from the shortcut), or the wrong shortcut was edited.

### Caveats

- **All-or-nothing per browser** — every print in that Chrome becomes silent.
- Whatever is the **default printer** wins, so mixing thermal (KOT/receipt) and A4 (invoices) on the
  same device is awkward.
- A Chrome update can occasionally reset the shortcut; re-check the Target line if dialogs reappear.
