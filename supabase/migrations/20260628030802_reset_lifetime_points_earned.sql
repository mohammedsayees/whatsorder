-- History backfill: applied directly to production on 2026-06-28 (recorded
-- remotely as version 20260628030802). Verbatim from the remote migration
-- history.

-- Clean stamp lifetime: start at 0, increments +1 per completed order from here.
-- Old per-AED 'earned' rows remain in loyalty_transactions as history.
update customers set lifetime_points_earned = 0;
