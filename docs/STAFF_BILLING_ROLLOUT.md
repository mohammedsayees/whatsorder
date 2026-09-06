# Staff billing, drafts and order timers

Apply `supabase/migrations/20260907160000_staff_billing_drafts_timers.sql`
before merging. It preserves existing products as public, adds restrictive
read policies for staff-only products, and adds server-maintained order clocks.
The previous orders-page RPC remains available for the old deployment.

## Dashboard walkthrough

1. Open **Orders → New order**, add a product and fill customer details/notes.
   Wait for **Draft saved on this device**, then go back or refresh. The ticket
   restores automatically, including quantities, options and delivery/table fields.
2. Choose **Hold & new bill**, build another bill, and open **Drafts** to resume
   the first. Drafts are isolated by restaurant, staff account and (for additions)
   parent order. They remain on that browser/device, not other terminals.
3. Choose **Discard draft** to remove an unfinished bill. Submitting successfully
   or committing to the offline outbox removes the active draft. Drafts never
   notify the kitchen, take payment or affect reports by themselves.
4. Search for a missing product, choose **+ New product**, enter name, price,
   category and quantity, then **Save & add to bill**. This requires internet.
   Similar existing products are suggested. Retrying a connection failure uses
   the same product identifier. New products remain in the staff catalog even
   if the bill is later discarded. Managers publish through **Menu → Edit →
   Visibility → Customer menu and staff**. Existing product options still use
   the normal options picker; quick creation makes simple products only.
5. Refresh a saved draft after changing a menu price. Review the warning and
   choose **Use current menu prices**. Unavailable products/options must be
   removed and re-added. The server continues to verify final prices.
6. Open **Orders**. Active cards show current stage and total elapsed minutes,
   refreshing every 15 seconds. **Overdue first** sorts across the entire
   filtered order set before pagination; **Oldest first** remains the default.
7. Managers can set total completion targets in **Settings → Order time targets**.
   Defaults: delivery 45, takeaway/car pickup 20, dine-in 30 minutes. Amber starts
   at 80%; red starts at the target, with overdue minutes after it is exceeded.
8. Change an order status and verify its stage timer restarts while total elapsed
   keeps growing. Completion/cancellation freezes total elapsed; later edits and
   payment changes do not alter the saved clock. Historical orders with no
   trustworthy completion event show timing unavailable rather than a guess.

## Operational details

- Drafts use IndexedDB with transaction-completion acknowledgements and revision
  checks. Two tabs cannot silently overwrite the same saved revision. Storage
  failures are shown and billing is blocked until storage is restored/reloaded.
  Browser storage clearing, private browsing expiry and device loss can remove
  local drafts; this release does not sync drafts between devices.
- In-flight submission identifiers persist before server calls. Restored uncertain
  submissions must be retried unchanged; add-on replay is resolved before mutable
  menu validation. Offline-outbox writes now await transaction commit before the
  draft may be cleared. Server idempotency protects replay after interrupted handoff.
- Draft time is excluded from order timing. Existing staff **Paid · Cash/Card/UPI**
  shortcuts create completed counter sales, so those sales have zero initial
  elapsed time. Use **Send to kitchen** for orders requiring preparation.
- Status flow is unchanged: dine-in has Ready to Serve, delivery has Out for
  Delivery, and takeaway/car pickup currently proceed from Preparing to Completed.
- Browser tests render the actual billing component with stubbed server actions.
  SQL tests exercise public visibility, tenant isolation, clock freezing and global
  priority pagination. They do not create production customer orders.

Rollback the application to the prior deployment if needed; leave the additive
schema in place. Reverting code stops exposing the new UI but does not delete drafts.
