# WhatsOrder UAE Pilot Readiness Audit

Date: 20 June 2026  
Scope: codebase, database migrations, security model, customer ordering, restaurant operations, Super Admin onboarding, UX, performance, and first 10–20 UAE restaurant readiness.

## Audit evidence

- Reviewed all application routes, server actions, Supabase clients, auth/session handling, core customer/admin components, reporting, feedback, Realtime alerts, printing, and SQL migrations.
- Ran with the required Node 20+ runtime:
  - `npm run lint` — passed
  - `npm run typecheck` — passed
  - `npm run test` — 30/30 passed across 9 files
  - `npm run build` — passed; all application routes compiled
- Tested `/r/chaixpress` and checkout at 390×844:
  - No horizontal overflow
  - No browser console warnings/errors
  - English/Arabic UI and RTL switch work
  - Public menu rendered 29 product cards and 45 buttons in demo data
  - Checkout with an AED 2 cart remained submittable despite the AED 15 minimum
- `npm audit --omit=dev` found two moderate vulnerabilities through Next.js's nested `postcss@8.4.31`. Do not run the suggested breaking `--force` downgrade; track a patched Next.js release or a safe override after verification.
- No live Supabase or production Vercel environment was available locally. Deployed policies, migrations, backups, SMTP, Realtime, and production environment settings are marked **needs verification**.

# A. Executive summary

## Scores

| Area | Score | Judgment |
|---|---:|---|
| Product readiness | 7.2/10 | Broadly functional and beyond MVP |
| Security readiness | 4.5/10 | Strong application intent, but database permissions contain pre-pilot blockers |
| UAE market fit | 7.5/10 | Good wedge for independent, WhatsApp-heavy restaurants |
| Pilot readiness | 5.8/10 | Suitable for controlled internal testing; not ready for 10 external tenants until P0 fixes |

**Biggest strength:** WhatsOrder covers the actual operating loop—menu, structured checkout, dashboard, Realtime handling, fulfilment-aware statuses, printing, CRM, feedback, and onboarding—in one coherent product.

**Biggest risk:** the Supabase database boundary does not consistently enforce the security model described by the application. Anonymous users can bypass the order server action, and authenticated restaurant users have broader direct-table permissions than the UI allows.

## Recommended positioning

**One-line positioning:**  
**WhatsOrder is WhatsApp-first direct ordering and order operations for UAE cafeterias—structured orders, live kitchen workflow, and customer ownership without marketplace dependency.**

Do not position it as a full restaurant operating system yet. That invites POS, accounting, inventory, dispatch, payment, and tax-invoice expectations that the product does not currently satisfy.

## Top 10 urgent fixes

1. Revoke anonymous/authenticated direct inserts into `orders`; force all public orders through the validated server flow.
2. Replace public `restaurants` table reads with a curated public view/RPC that excludes owner details and internal notes.
3. Tighten RLS so staff cannot directly alter/delete orders, customers, loyalty, menus, or settings outside intended permissions.
4. Add tenant-consistent composite foreign keys for menu, feedback, loyalty, and submission-key relationships.
5. Add a deployment verification script/checklist that confirms every required migration, RLS policy, function grant, Realtime publication, storage bucket, and environment variable.
6. Add durable order-status history and operational audit events, including who changed status and when.
7. Enforce the minimum order visibly before checkout submission and shorten the mobile checkout path.
8. Implement explicit marketing opt-out/consent withdrawal; current `OR` logic can preserve consent indefinitely.
9. Add error boundaries, monitoring, structured logs, and a restaurant-visible fallback when Realtime is offline.
10. Pin/enforce Node 20+ in local tooling and CI, then make lint, typecheck, tests, build, and migration checks mandatory.

# B. Critical blockers before onboarding real restaurants

## B1. Anonymous direct order insertion bypasses all order hardening

- **Severity:** Critical
- **Area:** `supabase/schema.sql:299-310`
- **Risk:** Supabase's anonymous REST API can insert directly into `orders` when `status='New'` and processing consent is true. This bypasses server-side menu pricing, availability, minimum order, opening hours, fulfilment validation, duplicate tokens, customer atomicity, and rate limiting. A malicious actor can flood a real restaurant dashboard with fake orders.
- **How to reproduce:** Use the public Supabase URL and anon key to insert a crafted order row directly into `/rest/v1/orders`.
- **Exact fix:** Drop the `"Public can insert new orders"` policy and revoke `INSERT` on `orders` from `anon` and `authenticated`. Keep order creation service-role-only through `create_order_with_customer_v3`.
- **Acceptance criteria:** Direct anon/authenticated inserts return permission denied; a valid customer checkout still creates exactly one order through the server action.

## B2. Public restaurant policy exposes private columns

- **Severity:** High
- **Area:** `supabase/super_admin_migration.sql:164-170`, `src/lib/data.ts:115-120`
- **Risk:** RLS filters rows, not columns. `restaurants` now contains `owner_name`, `owner_email`, `owner_phone`, and `internal_notes`, but the public policy allows selecting the entire active row. The app also uses `select("*")` and serializes the full restaurant object to customer client components.
- **How to reproduce:** Query active restaurants through Supabase REST using the anon key and select all columns; inspect the RSC payload for `/r/{slug}`.
- **Exact fix:** Revoke public table select and expose a `public_restaurants` view or `get_public_restaurant(slug)` RPC with only customer-safe columns. Pass a dedicated `PublicRestaurant` DTO to client components.
- **Acceptance criteria:** Owner/contact/internal-note fields cannot be retrieved with the anon key and are absent from customer-page payloads.

## B3. Authenticated RLS permissions exceed UI roles

- **Severity:** High
- **Area:** `supabase/super_admin_migration.sql:202-231`, `supabase/security_hardening_migration.sql:280-295`
- **Risk:** Policies use `for all` and permit staff to manage orders, menu records, customers, and loyalty directly. The UI says staff are read-only for menu/settings, but a staff JWT can call Supabase REST outside the UI and update or delete tenant records. Restaurant managers can also bypass application validation.
- **How to reproduce:** Sign in as staff, use the access JWT with the anon Supabase endpoint, and attempt `DELETE`/`PATCH` on tenant menu, customer, or order rows.
- **Exact fix:** Split policies by operation and role. Prefer read-only authenticated policies plus narrowly scoped RPCs for status changes. Remove direct client write grants where service-role server actions already perform writes.
- **Acceptance criteria:** Staff can read required operational data and perform only approved status actions; direct deletion or arbitrary field edits are denied.

## B4. Production migration state is not proven

- **Severity:** High
- **Area:** Supabase deployment process
- **Risk:** Security depends on the final versions of `is_restaurant_member`, `create_order_with_customer_v3`, function grants, RLS, Realtime publication, and later constraints. A missed or reordered migration silently restores weaker behavior.
- **How to reproduce:** Compare live `pg_policies`, `information_schema`, function definitions/grants, publication tables, and migration history against the repository.
- **Exact fix:** Move to a timestamped migration system with an immutable migration ledger and add a read-only production verification SQL script.
- **Acceptance criteria:** CI/staging and production checks prove expected policy/function hashes and fail release on drift.
- **Status:** Needs verification on the deployed Supabase project.

# C. Customer ordering flow findings

## What is ready

- Mobile-first menu is visually coherent and did not overflow at 390px.
- Arabic content and RTL direction switch correctly in main customer components.
- Search, category navigation, featured items, offers, cart persistence, fulfilment choices, table-number deep links, opening hours, and server validation are present.
- Prices and offers are reloaded from the database before persistence.
- WhatsApp handoff accounts for mobile popup restrictions.
- Duplicate submission tokens and atomic persistence are implemented in the final migration.

## Findings

### C1. Minimum order is discovered too late

- **Severity:** High UX / P1
- **Area:** `src/components/customer/CheckoutForm.tsx`, `src/components/customer/RestaurantMenu.tsx`
- **Evidence:** An AED 2 cart for a restaurant with AED 15 minimum could enter and submit the full checkout form.
- **Fix:** Show “AED X more to order” in the sticky cart and checkout summary; disable checkout/submit until the minimum is met, while retaining server enforcement.
- **Acceptance criteria:** Customers cannot begin or submit checkout below minimum and always see the remaining amount.

### C2. Order confirmation language overstates delivery to the restaurant

- **Severity:** High UX / P1
- **Area:** `src/components/customer/CheckoutForm.tsx:173-203`, thank-you flow
- **Risk:** The order is saved to the dashboard before the customer sends the WhatsApp message. Staff may act on an order that the customer never sent, while the customer may assume “saved” means accepted.
- **Fix:** Use explicit states: “Order request saved,” “Send on WhatsApp,” and “Await restaurant confirmation.” Add dashboard source/handoff status such as `whatsapp_handoff_pending/sent_unknown`.
- **Acceptance criteria:** No screen claims restaurant acceptance; the fallback path is unambiguous.

### C3. Checkout is long on mobile

- **Severity:** Medium
- **Evidence:** Four large fulfilment cards occupy most of the first screen; delivery details, payment, two consent controls, notes, and summary follow.
- **Fix:** Use compact segmented fulfilment controls, progressive disclosure, sticky total/submit, and collapse optional location/landmark/notes.

### C4. Arabic document semantics are incomplete

- **Severity:** Medium
- **Area:** `src/app/layout.tsx:30`, customer language components
- **Evidence:** UI switched to RTL, but `<html lang>` remained `en`.
- **Fix:** Set route-level language/dir using a cookie and server layout, or update document semantics safely on language change.
- **Acceptance criteria:** Arabic mode exposes `lang="ar"` and `dir="rtl"` to assistive technology.

### C5. Customer phone canonicalization is incomplete

- **Severity:** High data quality / P1
- **Area:** `src/lib/security.ts:47-49`, order creation
- **Risk:** `050...`, `+97150...`, and `97150...` can become separate customer records because customer phone is validated but not normalized before storage.
- **Fix:** Create one UAE/international canonical phone normalizer and use it for order storage, customer uniqueness, WhatsApp, reports, and feedback outreach.

### C6. Client cart restoration can fail on malformed local storage

- **Severity:** Low
- **Area:** `src/components/customer/CartProvider.tsx:47-52`
- **Risk:** `JSON.parse` is not guarded; corrupt local storage can break the menu.
- **Fix:** Catch parse/schema failures and clear the invalid cart.

### C7. Large menus render every card

- **Severity:** Medium performance
- **Evidence:** Demo rendered 29 cards, including featured duplicates, in one client component.
- **Fix:** Apply `content-visibility`, reduce duplicated featured rendering, or progressively render categories for menus above a threshold.

### C8. Trust elements needed for external pilots

- Add “No payment is taken online” where applicable.
- Show restaurant address/contact and “Order is confirmed only after restaurant reply.”
- Show delivery coverage/fee rules before checkout.
- Add privacy notice and data-retention contact.
- Add allergen/customization disclaimer until modifiers are supported.

# D. Restaurant dashboard findings

## Ready for daily operations

- Tenant-resolved dashboard session
- Realtime insert subscription filtered by restaurant
- 30-second reconciliation polling and token refresh
- Sound activation and optional repeat alerts
- Oldest-first active orders
- Fulfilment-aware linear status transitions enforced in SQL
- Cancellation confirmation
- 80mm KOT and receipt printing with HTML escaping
- Orders/customers pagination
- Menu availability, CSV import, images, offers, feedback, reports, and settings

## Rush-hour risks

### D1. Realtime is useful but not a durable queue

- **Priority:** P0 operational
- **Area:** `src/components/admin/NewOrderAlerts.tsx`
- **Risk:** Browser audio permissions, tab suspension, connectivity, token expiry, or Realtime outage can hide orders. Repeat-alert state is browser-local.
- **Fix:** Make the orders screen poll visibly every 10–15 seconds while open, show last successful sync, add a prominent offline banner, and use a dedicated “unacknowledged orders” server state.

### D2. Dashboard overview loads all orders and customers

- **Priority:** P1
- **Area:** `src/app/admin/page.tsx:16`, `src/lib/data.ts`
- **Risk:** Latency and memory grow indefinitely.
- **Fix:** Query five recent orders and aggregate metrics in SQL/RPC for a bounded period.

### D3. Printing state is device-local

- **Priority:** P1
- **Area:** `src/components/admin/OrderPrintActions.tsx`
- **Risk:** Another device does not know an order was printed; browser storage loss removes reprint history; marking occurs before the print dialog succeeds.
- **Fix:** Add `order_print_events` with type, user, device label, timestamp, and reprint flag. Record after print initiation/confirmation as far as browsers permit.

### D4. No durable order status timeline or prep-time measurement

- **Priority:** P1
- **Risk:** Support cannot answer who accepted/cancelled an order, and pilot metrics cannot measure restaurant response time.
- **Fix:** Add append-only `order_status_events`.

### D5. Destructive menu and offer deletes lack confirmation

- **Priority:** P1
- **Area:** `src/components/admin/MenuManager.tsx:593-599`, `src/components/admin/OffersManager.tsx:214-223`
- **Fix:** Confirmation plus soft-delete/archive for menu items that have historical order references.

### D6. Staff permission model is too coarse

- **Priority:** P1
- **Fix:** Define capabilities (`orders.read`, `orders.transition`, `orders.cancel`, `menu.availability`, `menu.edit`, `customers.read`, `reports.read`, `settings.edit`) and enforce in both server actions and RLS.

### D7. Missing loading/error states

- **Priority:** P1
- **Evidence:** No route-level `loading.tsx` or `error.tsx` files were present.
- **Fix:** Add actionable loading, retry, and support-reference states for customer menu, orders, reports, and Super Admin.

# E. Super Admin and onboarding findings

## Can 10 restaurants be onboarded manually?

Yes, after security blockers are fixed. The current creation, invitations, menu onboarding, branding, QR, settings, task tracking, plans/status, and notes are sufficient for a hands-on first cohort.

## What breaks at 20–50 restaurants

1. `getSuperAdminRestaurants` downloads every order and customer to count them.
2. Restaurant detail downloads full order/customer histories.
3. Auth user lookup lists up to 1,000 users and scans in memory.
4. Migration/configuration health is not visible per tenant/environment.
5. No support impersonation or safe diagnostic snapshot exists.
6. No audit log exists for Super Admin changes.
7. No onboarding template duplication or bulk progress actions exist.

## Build now

- Tenant health panel: last order, last dashboard activity, Realtime/config status, invitation status, menu completeness, test-order result.
- Onboarding “go live” preflight that blocks live status until required checks pass.
- Audit events for restaurant status, plan, ownership, access, settings, and destructive changes.
- Server-side portfolio aggregates and pagination.

## Build later

- Automated billing
- Complex support impersonation
- Bulk tenant operations
- Multi-branch account hierarchy
- White-labeling

# F. Security findings

| Severity | Finding | Area | Exact remediation |
|---|---|---|---|
| Critical | Anonymous direct order insertion bypass | `supabase/schema.sql` | Drop anon insert policy; revoke table insert; service-role RPC only |
| High | Public restaurant rows expose private columns | restaurant RLS + `select("*")` | Curated public view/RPC and DTO |
| High | Staff/authenticated direct-table writes exceed UI roles | category/item/order/customer/loyalty RLS | Split policies by action/role; RPCs for transitions |
| High | Cross-tenant FK consistency is not enforced | menu offers/items, feedback, loyalty, submission keys | Composite unique keys and composite FKs including `restaurant_id` |
| High | Marketing consent cannot be withdrawn | order/customer upsert SQL | Explicit latest consent state, source, timestamp, withdrawal |
| High | Production security migration state unknown | deployment | Automated schema/policy/function verification |
| Medium | Image validation trusts browser MIME | upload actions | Decode/re-encode image server-side; verify magic bytes and dimensions |
| Medium | Public storage bucket creation happens at runtime with service role | upload actions | Pre-provision buckets/policies; fail closed if missing |
| Medium | CSV formula injection | `src/lib/reports.ts:392-397` | Prefix cells beginning `= + - @` with `'` |
| Medium | No explicit CSP/security headers | `next.config.ts` | Add CSP, frame restrictions, referrer and permissions policies |
| Medium | Logout deletes cookies but does not revoke Supabase refresh session | login actions | Call `auth.signOut`/admin session revocation strategy |
| Medium | Rate limiter fails open on missing migration/IP and deletes old rows per request | `src/app/actions.ts`, SQL | Fail closed in production; scheduled cleanup; trusted Vercel IP source |
| Medium | Password policy is only 8 characters | invite setup | Supabase password policy, strength checks, optional MFA for Super Admin |
| Low | Feedback submission is not one transaction | feedback action | Atomic consume-token-and-insert RPC |
| Low | Remote images allow any HTTPS host | `next.config.ts` | Restrict to the Supabase project/storage host |

## Security checks that passed from code inspection

- Service-role key is referenced only in server-oriented modules; no `NEXT_PUBLIC` service key.
- Sensitive actions authenticate before tenant-scoped writes.
- Order status SQL scopes by both order and restaurant.
- SQL injection risk is low because Supabase query builders/RPC parameters are used.
- React output escaping is used; print HTML explicitly escapes values.
- No open redirect pattern was found.
- Realtime subscription includes a tenant filter and uses the authenticated token.
- Feedback tokens are random, stored hashed, expiring, and one per order.

## Needs verification

- Live RLS behavior with anon, staff, manager, owner, and Super Admin tokens
- Server Action origin/CSRF behavior behind the production domain/proxy
- Supabase leaked-password protection, MFA, SMTP, refresh-token settings
- Vercel environment separation and secret rotation
- Storage policies and content headers
- Backup/PITR and restore exercise
- Log redaction and production error reporting

# G. Database findings

## High-priority integrity fixes

1. Add tenant-safe composite relationships:
   - `menu_items(category_id, restaurant_id)` → `menu_categories(id, restaurant_id)`
   - `menu_offers(menu_item_id, restaurant_id)` → `menu_items(id, restaurant_id)`
   - feedback request/feedback `(order_id, restaurant_id)` → orders
   - loyalty `(customer_id, restaurant_id)` and `(order_id, restaurant_id)`
   - order submission key `(order_id, restaurant_id)`
2. Add constraints for:
   - latitude `[-90, 90]`, longitude `[-180, 180]`
   - nonblank names/phones/slugs
   - `total = subtotal + delivery_fee - loyalty_discount`
   - valid fulfilment-specific null/non-null fields
   - canonical lowercase slug uniqueness (`unique (lower(slug))`)
3. Add indexes matching actual queries:
   - `orders(restaurant_id, status, created_at)`
   - `orders(restaurant_id, fulfilment_type, status, created_at)`
   - `customers(restaurant_id, updated_at desc)`
   - `feedback_requests(expires_at)` for cleanup
   - `order_submission_keys(created_at)` for cleanup
4. Add append-only `order_status_events`, `audit_events`, and `order_print_events`.

## Delete policy

- Restaurant deletion currently cascades through almost all tenant data. Use status/soft deletion for restaurants and require a separate, logged purge process.
- Menu-item hard delete is operationally risky. Archive items by default; historical order JSON keeps text but loses relational reporting continuity.
- `schema.sql` contains destructive Chai Xpress menu deletes. It is documented not to rerun, but it should be split into schema and seed files to remove the foot-gun.

## Migration quality

- Migrations are readable and progressively harden the system.
- The current ordered-file process is fragile and lacks version tracking.
- Some old functions/policies remain relevant only because later migrations replace them; drift is difficult to detect.
- Adopt timestamped migrations through Supabase CLI and test from an empty database plus an upgrade snapshot.

# H. Code quality findings

## Strengths

- Clear domain modules for date/time, opening hours, status flow, WhatsApp, reporting, feedback, and security.
- Next.js 16 async request APIs are used correctly.
- Independent data reads are often parallelized.
- Tenant IDs are included in most service-role queries.
- TypeScript strict mode and tests pass.

## Improvements

### H1. `src/app/actions.ts` is too large

- **Problem:** 1,255 lines mix public checkout, order transitions, menu CRUD, storage, CSV import, offers, settings, and categories.
- **Fix:** Split by domain: `orders/actions.ts`, `menu/actions.ts`, `offers/actions.ts`, `settings/actions.ts`, `storage/actions.ts`.

### H2. Validation is inconsistent

- Menu/settings actions use ad hoc `Number(...)` and unbounded strings.
- Add shared schemas with maximums and domain validation. Reject `NaN`, excessive prices/fees, blank names, invalid WhatsApp numbers, and malformed URLs.

### H3. Errors can expose database messages

- Some redirects/UI return raw Supabase error text.
- Map errors to user-safe codes; log structured internal detail with a correlation ID.

### H4. Data types are handwritten

- Generate Supabase database types and use typed clients/RPC signatures to catch migration drift.

### H5. Role checks are duplicated/inconsistent

- Centralize permissions and test every server action against a capability matrix.

### H6. Missing integration tests

- Existing tests cover pure logic well but not server actions, RLS, RPC concurrency, invitation flow, CSV injection, storage, or Realtime authorization.

### H7. Runtime requirement is not enforced operationally

- Default shell Node 16 caused lint/test startup errors; Node 20 succeeded.
- Add `.nvmrc`, `packageManager`, CI runtime pin, and a preinstall/runtime check.

# I. Performance findings

## Quick wins

- Replace public/menu `<img>` usage with `next/image` or a Supabase image transformation strategy.
- Restrict image source hosts.
- Add `content-visibility: auto` to offscreen menu categories.
- Query only five recent dashboard orders.
- Add composite indexes matching status and fulfilment filters.
- Limit public reviews query instead of loading all approved feedback to calculate an average.
- Paginate Super Admin lists and detail histories.

## Medium-term

- SQL/RPC aggregates for dashboard, customer segments, and Super Admin portfolio.
- Precomputed daily restaurant metrics after volume justifies it.
- Image resizing/compression at upload.
- Virtualized or progressive menu rendering for 100+ products.
- Cache public restaurant/menu data with explicit invalidation after edits.

## Not worth optimizing yet

- Complex distributed caching
- Data warehouse/BI pipeline
- Search infrastructure beyond in-memory menu search
- Microservices
- Event streaming platform

# J. UX/UI findings

## Customer menu

- The current visual system is credible and mobile-focused.
- Header/status pills become dense on small screens; prioritize open/closed, ETA, fee, and minimum order.
- Featured products are duplicated in normal categories; this increases scroll length.
- Missing product images visibly reduce perceived quality. Require a minimum image-completeness score before go-live for image-led concepts.
- Add “popular,” “vegetarian/spicy,” allergen, and customization only when restaurant data can maintain them reliably.

## Restaurant dashboard

- Bottom navigation with seven items is crowded for non-staff roles.
- Staff need a dedicated rush-hour order mode: larger cards, fewer analytics, one primary action, persistent offline/sync indicator.
- Cancellation should require a reason.
- Settings expose both “Active” and “Accept new orders,” which can confuse operators. Keep tenant status under Super Admin and show only the operational accepting-orders control to restaurant users.
- Add success/error toasts and dirty-form protection.

## Arabic

- Core RTL works, but completeness needs a native-Arabic review.
- Admin is English-only; acceptable for an initial segment only if pilot staff confirm it.
- Dynamic document language and localized validation errors are required.

# K. Feature gap analysis

| Feature | Priority | Build | Complexity | Risk if skipped |
|---|---|---|---|---|
| KOT printing | P0 | Harden now | Medium | Kitchen misses/misreads orders |
| Customer receipt | P1 | Harden now | Low | Trust/support issues |
| Notification sound | P0 | Harden now | Medium | Missed new orders |
| Repeating order alert | P1 | Harden now | Medium | Unaccepted orders |
| Order status updates | P0 | Now | Medium | No operational control |
| Payment link support | P2 | Later/manual link first | Medium | Some prepaid demand lost |
| Online payment gateway | P3 | Later | High | Not required for wedge |
| Customer reorder link | P2 | Later | Medium | Lower repeat conversion |
| Loyalty redemption | P2 | Later | Medium/High | Current points feel incomplete |
| Coupon codes | P2 | Later | Medium | Manual offers suffice |
| Delivery fee settings | P0 | Now | Low | Incorrect totals |
| Minimum order value | P0 | Harden now | Low | Checkout frustration/margin |
| Business hours | P0 | Now | Medium | Orders while closed |
| Item availability | P0 | Now | Low | Unfulfillable orders |
| Scheduled orders | P2 | Later | High | Timing mistakes |
| Dine-in QR table flow | P1 | Pilot now | Medium | Table confusion |
| Staff PIN/login | P2 | Later; use named accounts now | Medium | Shared-account behavior |
| Multi-branch support | P3 | Later | High | Premature complexity |
| WhatsApp Business API | P3 | Later | High/compliance | Click-to-chat remains manual |
| Broadcast/campaigns | P3 | Later | High/compliance | Consent/reputation risk |
| Review collection | P1 | Now | Medium | Lost pilot learning/social proof |
| Customer segmentation | P2 | Keep basic only | Low/Medium | Not core to first operations |
| Restaurant discovery | P3 | Do not build | High | Destroys focused wedge |
| VAT/TRN invoice | P2 | Later, but label receipts clearly | High | Cannot sell as compliant POS |
| Prep-time tracking | P1 | Add via status events | Medium | Cannot measure operational value |
| Order status history | P1 | Now | Medium | No accountability/support trail |
| Delivery assignment | P3 | Later | High | Out of current product boundary |
| Inventory | P3 | Do not build | High | Major scope expansion |

# L. UAE go-to-market and pricing recommendations

## First target segment

Independent UAE cafeterias, karak/tea shops, shawarma/burger/juice outlets, and small cloud kitchens with:

- One location, optionally two
- Owner-led operations
- Meaningful WhatsApp ordering today
- 30–150 direct orders/day potential
- No hard requirement for immediate POS integration
- Delivery/takeaway/car pickup or simple dine-in
- English-speaking owner/manager and multilingual frontline staff

Avoid fine dining, hotel restaurants, large chains, complex modifier-heavy menus, restaurants requiring fiscal/POS integration, and delivery-fleet operations until the core loop is proven.

## Strongest wedge

“Stop decoding messy WhatsApp messages. Give customers a proper menu and checkout, while your staff receive structured orders in a live queue—and keep the customer relationship.”

Lead with fewer missing details, faster acceptance, direct customer ownership, and simpler staff handling. “No marketplace commission” is supporting value, not the only claim.

## Pricing experiments

Treat these as pilot hypotheses, not established market prices:

- **Pilot:** free setup + 30 days free, in exchange for weekly feedback and data access
- **Starter test:** AED 149/month for menu, WhatsApp handoff, order dashboard, printing
- **Operations test:** AED 249/month for staff accounts, CRM, feedback, reports, offers
- **Setup fee after proof:** AED 300–750 depending on menu/branding workload

Do not launch more than two paid plans during the first 10 restaurants. Test willingness to pay against saved staff time and direct-order volume.

## Expected objections

- “Customers already message us on WhatsApp.”
- “Will it print automatically?”
- “What happens if internet/sound stops?”
- “Does it connect to our POS?”
- “Can customers pay online?”
- “Who updates the menu?”
- “Will staff actually use the dashboard?”
- “Can you send offers automatically?”
- “Is this a tax invoice?”
- “What happens to customer data if we leave?”

## Required sales collateral

- 60-second mobile ordering demo
- One-page before/after WhatsApp order example
- Rush-hour dashboard and KOT demo
- Pilot scope and fallback sheet
- Data/privacy summary
- Supported/not-supported feature sheet
- Onboarding checklist and device requirements
- Chai Xpress case study with measured outcomes

## Legal/compliance notes

- Add a clear privacy notice, retention policy, processor/controller responsibilities, and consent-withdrawal route before external pilots.
- Keep customer receipts labelled “not a tax invoice” until VAT/TRN requirements are implemented and reviewed.
- Have UAE counsel review the pilot agreement and marketing-consent workflow. Official starting points include the [UAE Government data-protection overview](https://u.ae/en/about-the-uae/digital-uae/data/data-protection-laws) and [Federal Tax Authority VAT resources](https://tax.gov.ae/en/default.aspx).

# M. First 10 restaurant pilot plan

## Stage 0: Chai Xpress internal validation

Run 50–100 test/real orders across:

- All fulfilment types
- Opening/closing and pause behavior
- Duplicate taps and weak networks
- Realtime disconnect/reconnect
- Audio permission and backgrounded device
- Two dashboard devices
- KOT/receipt on the actual printer/browser
- Cancellation and refund-like operational handling
- Arabic ordering
- Menu item unavailable during checkout
- Offer expiry and quantity limit

## Stage 1: First 3 restaurants

- Choose similar, owner-operated concepts.
- White-glove onboarding.
- Keep a direct WhatsApp fallback.
- Daily check-in for first three days, then twice weekly.
- No custom features during week one unless they block ordering.

## Stage 2: Restaurants 4–10

- Use the same onboarding template and preflight.
- Time each onboarding step.
- Require one trained owner/manager and one staff champion.
- Compare support volume and activation time with the first cohort.

## Pilot agreement

- 30-day term and exit rights
- Exact included features and known exclusions
- No guaranteed POS/payment/tax-invoice integration
- Restaurant responsibility for menu accuracy, pricing, fulfilment, customer service, and lawful outreach
- WhatsOrder responsibilities for hosting, security, support, backup approach, and incident notification
- Customer-data ownership, processing purpose, retention, deletion/export
- Availability target and WhatsApp/manual fallback
- Supported devices/browsers/printers
- Permission to use anonymized pilot metrics and optional case study

## Pilot metrics

- Menu visit → cart → checkout → saved order conversion
- WhatsApp handoff completion proxy/user confirmation
- Order acceptance time
- Time to preparation/completion
- Missed/duplicate/fake orders
- Address clarification rate
- Cancellation rate and reason
- Staff touches per order
- Print success/reprint rate
- Realtime offline minutes
- Repeat customer rate
- Support tickets per restaurant/week
- Menu update time
- Restaurant willingness to pay and continue

## Go/no-go thresholds

- No cross-tenant or private-data exposure
- No unvalidated direct order path
- ≥99% saved-order visibility in dashboard during pilot test windows
- Median acceptance under five minutes for staffed periods
- <2% technical duplicate/missed order incidents
- Staff can operate without founder intervention by day three
- At least 6/10 restaurants willing to continue at a tested price

# N. 30-day action plan

## Days 1–7: security boundary

- Remove anon order inserts and public private-column exposure.
- Replace broad RLS writes with least-privilege policies/RPCs.
- Add composite tenant constraints and query indexes.
- Add migration verification and staging RLS tests.

## Days 8–14: order operations

- Durable status/print events.
- Visible polling/offline recovery.
- Minimum-order UX.
- Canonical phone storage.
- Destructive-action confirmation and cancellation reasons.

## Days 15–21: pilot operations

- Error boundaries and monitoring.
- Super Admin go-live preflight and tenant health.
- Image hardening.
- Consent withdrawal/privacy flow.
- Real printer/device testing.

## Days 22–30: controlled rollout

- Chai Xpress load/rush test.
- Onboard three external restaurants.
- Measure daily.
- Fix only blockers and repeated friction.
- Freeze feature scope before restaurants 4–10.

# O. Codex implementation task list

## O1. Lock down public order creation

- **Priority:** P0
- **Files:** new Supabase migration; RLS integration tests
- **Approach:** drop public insert policy, revoke grants, retain service-role RPC.
- **Acceptance:** anon/auth direct insert denied; server checkout passes; duplicate concurrency creates one order.
- **Testing:** anon REST insert, authenticated insert, valid checkout, replay token, concurrent submit.
- **Risk if skipped:** fake-order flooding and forged totals.

## O2. Create a safe public restaurant projection

- **Priority:** P0
- **Files:** migration, `src/lib/data.ts`, `src/lib/types.ts`, customer pages/components
- **Approach:** public view/RPC + `PublicRestaurant` DTO.
- **Acceptance:** no owner/internal fields in anon queries or RSC payload.
- **Testing:** REST field probe, page payload inspection, menu/checkout regression.
- **Risk:** private tenant data leakage.

## O3. Rebuild least-privilege RLS

- **Priority:** P0
- **Files:** migration, permission tests
- **Approach:** operation-specific role policies; status RPC only; remove unnecessary direct writes.
- **Acceptance:** full role matrix passes.
- **Testing:** anon/staff/manager/owner/Super Admin CRUD attempts.
- **Risk:** tenant insider damage and UI bypass.

## O4. Add tenant-consistent foreign keys

- **Priority:** P0
- **Files:** migration
- **Approach:** audit/repair mismatches, add composite unique keys/FKs.
- **Acceptance:** cross-tenant references fail at database level.
- **Testing:** intentional mismatched inserts/updates.
- **Risk:** corrupted tenant reporting and data leakage.

## O5. Add migration/deployment preflight

- **Priority:** P0
- **Files:** `scripts/verify-supabase.mjs`, docs, CI
- **Approach:** verify tables, columns, constraints, policies, grants, functions, Realtime, storage.
- **Acceptance:** release fails on drift.
- **Testing:** omit one migration in staging and confirm failure.
- **Risk:** production silently runs weaker schema.

## O6. Add durable order operational events

- **Priority:** P1
- **Files:** migration, status RPC, print actions, order UI/reports
- **Approach:** append status, cancellation reason, actor, and print events.
- **Acceptance:** every transition is traceable and prep times computable.
- **Testing:** full flows, concurrent transitions, cancellation, reprint.
- **Risk:** no support evidence or pilot operations metrics.

## O7. Harden new-order detection

- **Priority:** P0
- **Files:** alerts component/actions, orders page
- **Approach:** visible last-sync, 10–15s polling, unacknowledged server state, offline banner.
- **Acceptance:** a missed Realtime event appears through polling within 15 seconds.
- **Testing:** disable Realtime, expire token, background/restore tab, two tabs.
- **Risk:** missed restaurant orders.

## O8. Fix minimum-order and checkout friction

- **Priority:** P1
- **Files:** menu and checkout components, translations, tests
- **Approach:** remaining-amount message, disabled checkout/submit, compact fulfilment UI.
- **Acceptance:** below-minimum users cannot submit and understand why.
- **Testing:** every fulfilment, English/Arabic, exact boundary.
- **Risk:** avoidable abandonment.

## O9. Canonicalize customer phone numbers

- **Priority:** P1
- **Files:** security/WhatsApp helpers, order action/RPC, migration
- **Approach:** store E.164-like canonical value plus optional display input.
- **Acceptance:** UAE local and international variants map to one customer.
- **Testing:** `05`, `+971`, `00971`, spaces, invalid lengths, non-UAE.
- **Risk:** duplicate CRM records and incorrect outreach.

## O10. Implement consent withdrawal and privacy controls

- **Priority:** P1
- **Files:** migration, checkout, customer UI, privacy page
- **Approach:** latest consent event/state; opt-out link/manual action; no irreversible OR.
- **Acceptance:** withdrawn users are excluded immediately from outreach.
- **Testing:** opt-in, repeat no-consent, explicit withdrawal, export.
- **Risk:** unlawful/undesired marketing.

## O11. Add error handling and monitoring

- **Priority:** P1
- **Files:** route `error.tsx`/`loading.tsx`, logging utilities, Vercel/Sentry equivalent
- **Approach:** correlation IDs, safe UI errors, alerting for order failures and Realtime.
- **Acceptance:** production failures are visible without leaking internals.
- **Testing:** forced DB/RPC/storage/Realtime failures.
- **Risk:** silent pilot incidents.

## O12. Harden uploads and storage

- **Priority:** P1
- **Files:** upload actions, bucket provisioning migration/script
- **Approach:** magic-byte decode/re-encode, dimensions, pre-created buckets, restricted hosts.
- **Acceptance:** spoofed/corrupt/oversized images fail safely.
- **Testing:** wrong MIME, polyglot, huge dimensions, valid JPG/PNG/WebP.
- **Risk:** malicious files, storage abuse, poor performance.

## O13. Sanitize CSV exports

- **Priority:** P1
- **Files:** `src/lib/reports.ts`, tests
- **Approach:** neutralize spreadsheet formula prefixes.
- **Acceptance:** customer/product cells cannot execute formulas.
- **Testing:** values beginning `=`, `+`, `-`, `@`, tabs, quotes, line breaks.
- **Risk:** spreadsheet injection on owner devices.

## O14. Optimize dashboard and Super Admin queries

- **Priority:** P1
- **Files:** data modules/pages, migration/RPCs
- **Approach:** bounded recent queries, aggregates, pagination, composite indexes.
- **Acceptance:** response time stays stable at 100k orders/tenant in test data.
- **Testing:** seeded volume, query plans, page correctness.
- **Risk:** degradation as pilots accumulate data.

## O15. Establish release CI

- **Priority:** P1
- **Files:** `.nvmrc`, `package.json`, CI workflow, deployment docs
- **Approach:** Node 20+, clean install, lint, typecheck, tests, build, audit review, migration verification.
- **Acceptance:** releases cannot proceed with a failed gate or wrong runtime.
- **Testing:** intentionally break each gate.
- **Risk:** environment-specific release failures.
