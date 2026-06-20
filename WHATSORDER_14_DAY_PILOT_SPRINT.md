# WhatsOrder strict 14-day pilot-readiness sprint

Only P0 and P1 work is included. Advanced payments, POS, campaigns, inventory, subscriptions, marketplace, and multi-branch features are excluded.

## Sprint release criteria

- No anonymous/authenticated bypass of validated order creation.
- No public access to private restaurant fields.
- Role/RLS matrix passes for five identities.
- Cross-tenant references fail at database level.
- Missed Realtime events recover through polling within 15 seconds.
- All order transitions and prints are auditable.
- Chai Xpress completes a full two-device rush simulation.
- Lint, typecheck, 30 existing tests, new tests, build, and deployment preflight pass.

## Days 1–2: Security and tenant isolation

### 1. Remove direct public order insertion

- **Priority/Risk:** P0 / Critical
- **Files likely involved:** new `supabase/YYYYMMDD_lock_public_order_writes.sql`, RLS tests
- **Change:** drop public insert policy and revoke `INSERT` from `anon`/`authenticated`.
- **Acceptance:** only service-role `create_order_with_customer_v3` can create an order.
- **Manual test:** attempt direct REST insert with anon and staff JWT; complete valid checkout.
- **Automated test:** database role test plus replay/concurrent submission test.

### 2. Replace public restaurant table access with a safe projection

- **Priority/Risk:** P0 / High
- **Files:** migration, `src/lib/data.ts`, `src/lib/types.ts`, customer pages/components
- **Change:** expose only public columns through a view/RPC; introduce `PublicRestaurant`.
- **Acceptance:** owner email/phone/internal notes are absent from REST and browser payloads.
- **Manual test:** anon REST probe and customer-page payload inspection.
- **Automated test:** public DTO snapshot/forbidden-column test.

### 3. Tighten role-based RLS

- **Priority/Risk:** P0 / High
- **Files:** migration, permission matrix tests
- **Change:** split `for all` policies; staff cannot arbitrary-update/delete tenant data.
- **Acceptance:** staff can read orders and use approved transitions only; manager/owner capabilities match product rules.
- **Manual test:** CRUD attempts using each role's JWT.
- **Automated test:** table-driven role/action matrix.

## Day 3: Database tenant integrity

### 4. Add composite tenant foreign keys and indexes

- **Priority/Risk:** P0 / High
- **Files:** new integrity migration
- **Change:** tenant-safe FKs for menu, offers, feedback, loyalty, submission keys; add query indexes.
- **Acceptance:** mismatched tenant IDs fail; current data migrates cleanly.
- **Manual test:** insert cross-tenant category/offer/feedback/loyalty links.
- **Automated test:** migration test from empty and representative existing schema.

### 5. Add migration/deployment preflight

- **Priority/Risk:** P0 / High
- **Files:** `scripts/verify-supabase.mjs`, `package.json`, deployment docs/CI
- **Change:** verify final policies, grants, functions, publication, buckets, and required environment keys.
- **Acceptance:** preflight reports one unambiguous pass/fail summary.
- **Manual test:** run against staging with one intentionally missing object.
- **Automated test:** mocked metadata result plus CI execution.

## Days 4–5: Customer ordering reliability

### 6. Canonicalize customer phone numbers

- **Priority/Risk:** P1 / High
- **Files:** `src/lib/security.ts`, `src/lib/whatsapp.ts`, `src/app/actions.ts`, RPC migration
- **Change:** normalize before storage and customer lookup.
- **Acceptance:** equivalent UAE formats resolve to one customer.
- **Manual test:** submit repeat orders with `05`, `971`, `+971`, and spaced forms.
- **Automated test:** normalization and customer-upsert cases.

### 7. Fix minimum-order behavior

- **Priority/Risk:** P1 / High UX
- **Files:** `RestaurantMenu.tsx`, `CheckoutForm.tsx`, translations
- **Change:** show remaining amount and block checkout/submit below minimum.
- **Acceptance:** exact minimum unlocks checkout; lower values stay blocked.
- **Manual test:** AED 0, AED 14.99, AED 15.00, delivery and non-delivery.
- **Automated test:** threshold helper/component tests.

### 8. Clarify WhatsApp handoff and confirmation

- **Priority/Risk:** P1 / High operational
- **Files:** checkout and thank-you components, order type/migration if handoff state is stored
- **Change:** distinguish saved request, WhatsApp send, and restaurant acceptance.
- **Acceptance:** customer and staff never interpret “saved” as “accepted.”
- **Manual test:** close WhatsApp without sending, popup blocked, retry.
- **Automated test:** result-state rendering tests.

## Days 6–7: Restaurant dashboard operations

### 9. Add durable order status events and cancellation reasons

- **Priority/Risk:** P1 / High
- **Files:** migration, transition RPC, status actions/UI, types
- **Change:** append actor/time/from/to/reason for every transition.
- **Acceptance:** complete immutable timeline for each order.
- **Manual test:** full flow and cancellation from each cancellable state.
- **Automated test:** transition concurrency and event assertions.

### 10. Add reliable polling/offline recovery

- **Priority/Risk:** P0 / Critical operational
- **Files:** `NewOrderAlerts.tsx`, alert actions, orders UI
- **Change:** 10–15s reconciliation, last-sync indicator, persistent offline warning, unacknowledged order state.
- **Acceptance:** order appears within 15s when Realtime is disabled.
- **Manual test:** disable network/Realtime, background tab, expire token, restore.
- **Automated test:** alert state reducer/reconciliation tests.

### 11. Enforce operational capability checks

- **Priority/Risk:** P1 / High
- **Files:** auth/permissions module, all admin actions/pages
- **Change:** central capability matrix for status, cancel, menu, customers, reports, settings.
- **Acceptance:** UI and server actions return the same authorization result.
- **Manual test:** staff/manager/owner navigation and direct action submission.
- **Automated test:** capability table and protected action tests.

## Day 8: Printing and order handling

### 12. Add print events and actual-device hardening

- **Priority/Risk:** P1 / High operational
- **Files:** migration, `OrderPrintActions.tsx`, print action, order UI
- **Change:** record print/reprint/user/device; test 80mm output.
- **Acceptance:** print history survives browsers/devices and KOT is readable on target printer.
- **Manual test:** Chrome/Android/desktop, popup blocked, KOT/receipt/both/reprint.
- **Automated test:** escaping and print-event payload tests.

### 13. Confirm destructive menu/offer changes

- **Priority/Risk:** P1 / Medium
- **Files:** `MenuManager.tsx`, `OffersManager.tsx`, delete actions
- **Change:** confirmation and archive-first behavior.
- **Acceptance:** accidental one-tap deletion is impossible.
- **Manual test:** cancel/confirm delete and historical order display.
- **Automated test:** archive filtering and authorization tests.

## Days 9–10: Super Admin onboarding

### 14. Add go-live preflight and tenant health

- **Priority/Risk:** P1 / High
- **Files:** Super Admin data/pages/actions, migration if health events are stored
- **Change:** block live status until required checks pass; show menu, WhatsApp, owner, fulfilment, hours, test order, Realtime/config health.
- **Acceptance:** every live tenant has a recorded successful preflight.
- **Manual test:** attempt go-live with each missing prerequisite.
- **Automated test:** preflight rule tests.

### 15. Paginate/aggregate Super Admin data

- **Priority/Risk:** P1 / Medium
- **Files:** `src/lib/super-admin-data.ts`, Super Admin pages, SQL/RPC migration
- **Change:** server-side counts, last-order query, pagination, bounded detail history.
- **Acceptance:** no portfolio page downloads all orders/customers.
- **Manual test:** seed 50 restaurants and large histories.
- **Automated test:** pagination/count correctness.

## Day 11: UX polish

### 16. Shorten mobile checkout and complete Arabic semantics

- **Priority/Risk:** P1 / Medium
- **Files:** checkout/menu, layout/language hook, translations
- **Change:** compact fulfilment selector, progressive optional fields, sticky submit; correct document `lang`/`dir`.
- **Acceptance:** key total/action visible with less scrolling; Arabic assistive semantics correct.
- **Manual test:** 360/390/430px, keyboard open, English/Arabic, all fulfilment types.
- **Automated test:** language/direction and conditional-field tests.

### 17. Add route loading/error states

- **Priority/Risk:** P1 / Medium
- **Files:** customer/admin/Super Admin `loading.tsx` and `error.tsx`
- **Change:** retryable, safe, context-specific states with support reference.
- **Acceptance:** DB failures never produce an unexplained blank/stack screen.
- **Manual test:** force restaurant/menu/orders/report query failures.
- **Automated test:** error mapping tests.

## Day 12: Security polish and observability

### 18. Harden uploads, CSV, headers, and logs

- **Priority/Risk:** P1 / Medium–High
- **Files:** upload actions, reports, `next.config.ts`, logging utility
- **Change:** decode/re-encode images, pre-provision buckets, formula-safe CSV, CSP/security headers, redacted structured logs.
- **Acceptance:** malicious files/formulas are neutralized; browser security headers present.
- **Manual test:** spoofed image, formula customer name, header inspection.
- **Automated test:** file-signature, CSV prefix, and header tests.

### 19. Fix consent withdrawal

- **Priority/Risk:** P1 / High compliance
- **Files:** migration, order RPC, customer UI/privacy notice
- **Change:** latest explicit consent state and withdrawal; remove irreversible `OR`.
- **Acceptance:** withdrawn customer disappears from outreach eligibility immediately.
- **Manual test:** opt in, repeat order, withdraw, export/report.
- **Automated test:** consent-state transition tests.

## Day 13: Full release verification

### 20. Chai Xpress rush simulation

- **Priority/Risk:** P0 / Critical operational
- **Files:** test scripts/checklist; fixes only if blockers emerge
- **Change:** run 30+ orders from multiple phones with two dashboard devices and target printer.
- **Acceptance:** no missed/duplicate/cross-tenant orders; all recoveries and prints work.
- **Manual test:** weak network, Realtime off, rapid double taps, unavailable item, close time, Arabic, all fulfilment types.
- **Automated test:** concurrent order/status integration suite.

### 21. Security regression and restore drill

- **Priority/Risk:** P0 / Critical
- **Change:** role matrix, public endpoint probe, migration preflight, backup restore to staging.
- **Acceptance:** documented evidence attached to release.

## Day 14: Release gate and pilot handoff

### 22. Final CI and deployment

- **Priority/Risk:** P0 / High
- **Files:** `.nvmrc`, `package.json`, CI, deployment/pilot docs
- **Change:** pin Node 20+, run clean install, lint, typecheck, all tests, build, audit review, migration preflight.
- **Acceptance:** production deployment passes smoke tests and rollback is documented.

### 23. Restaurant onboarding pack

- **Priority/Risk:** P1 / Medium
- **Deliverables:** pilot agreement checklist, device/browser guide, fallback SOP, staff one-page guide, support contacts, metric sheet.
- **Acceptance:** a new restaurant can be onboarded in under two hours and operate without founder help by day three.

## Deferred explicitly

- Online payments/payment reconciliation
- VAT/TRN invoice generation
- WhatsApp Business API automation
- Bulk campaigns
- Subscription billing
- Marketplace/discovery
- Driver fleet
- Inventory/food cost
- Multi-branch
- Automatic/silent printing
