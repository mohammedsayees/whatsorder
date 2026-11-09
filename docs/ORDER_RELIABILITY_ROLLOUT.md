# Order reliability rollout

This change makes payment collection/completion and payment corrections transactional,
resolves saved staff-order retries before current-menu validation, and adds an
authorized saved-order confirmation with a WhatsApp resend link.

## Deploy in this order

1. Apply all outstanding migrations, including
   `supabase/migrations/20260907120000_atomic_order_payments.sql`.
2. Run `supabase/tests/atomic_order_payments.sql` on a test database with
   `psql -v ON_ERROR_STOP=1`. The script rolls back its fixtures and checks.
3. Configure `PUSH_AUTH_SECRET` or `CUSTOMER_AUTH_SECRET` with at least 32
   random characters. The existing checkout cookie authorizes the confirmation;
   web-push delivery keys are not required for this feature.
4. Deploy the application only after the migration is present.

If neither signing secret is configured, checkout retains an in-memory,
direct-tap WhatsApp handoff. Reloadable confirmation requires the signing secret.
Confirmation access lasts seven days in the browser that placed the order;
missing/expired cookies or a different restaurant return not found. No public
order lookup or new browser database privileges are introduced.

## Acceptance checks

- Save an order, close WhatsApp without sending, reload the confirmation page,
  and resend the original order. Verify only one database order exists.
- Open the confirmation URL in another browser and under a different restaurant:
  neither should expose order details.
- Verify English and Arabic checkout handoff, including mobile browsers.
- Simulate a staff-order response timeout after persistence, make its item
  unavailable, then retry the queued payload: return the saved order.
- Retry the same payment completion: do not create another audit/status event
  or send another completion notification from that action.
- Reject a completion with an invalid transition: payment and audit must roll back.
- Force a correction audit write to fail: the payment method must stay unchanged.
- Verify staff cannot correct closed-shift payments, while management can.

The database function reuses existing status transitions and loyalty accounting.
It does not recalculate previously finalized shift reports. Notification queuing,
daily-summary delivery, and broad refactoring remain separate follow-up work.

## Rollback

Revert the application change if necessary; the additive payment RPC may remain
installed. Do not drop it while an application version still calls it.
