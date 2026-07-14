# WhatsOrder — Agent Orientation

Multi-tenant WhatsApp-ordering + restaurant dashboard SaaS (UAE). Pilot: Chai Xpress (slug `chaixpress`).

## Stack
- **Next.js 15.5.19 App Router** (`next`), **React 19**, **TypeScript**, **Tailwind 3**. Build: `next build` (webpack; do NOT re-enable Turbopack — broke on the 16→15 downgrade).
- Runtime: **Node ≥20.9** (`.nvmrc` = 22; use `nvm use 22` — local default may be Node 16 and will fail lint/tests).
- DB/auth: **Supabase** (`@supabase/supabase-js`). Two clients in `src/lib/supabase.ts`: `getSupabase()` (anon, read-only) and `getSupabaseAdmin()` (service-role, all writes).
- **Multi-tenancy:** every tenant-owned table has a **`restaurant_id`** column. RLS limits authenticated JWTs to **read-only, tenant-scoped** access via `is_restaurant_member(restaurant_id)` / `is_super_admin()`. All writes go through service-role server actions, never the browser.
- Auth/session refresh: `src/middleware.ts` (must be named `middleware.ts` on Next 15).

## Architecture — two separate paths (do not cross without instruction)
**Customer path** (public PWA, QR/link — keep it lightweight, no heavy deps):
- `src/app/r/[restaurantSlug]/` (menu, checkout, thank-you), `src/components/customer/` (CartProvider, CheckoutForm, RestaurantMenu).
- Order creation: `createOrderAction` in `src/app/actions.ts` → RPC `create_order_with_customer_v4` (server re-prices via `src/lib/order-pricing.ts`).

**Staff/admin path** (dashboard, behind auth):
- `src/app/admin/` (orders, orders/new staff entry, shifts, menu, menu/import AI builder, customers, reports, settings), `src/app/super-admin/`.
- Components in `src/components/admin/`; server actions in `src/app/actions.ts` and `src/app/admin/*/actions.ts`; auth guards in `src/lib/super-admin-auth.ts` (`requireRestaurantAdmin`, `requireRestaurantRole`).

> ⚠️ Changing one path must not touch the other unless the task says so. The customer bundle (`/r/[slug]`, ~119 kB) is the load-bearing perf constraint — never add admin/AI weight to it (dynamic-import heavy libs like `pdfjs-dist`).

## Conventions
- **Branches:** `feature/<topic>` off `main`; merge with `git merge --no-ff`. (History also shows `codex/*`.)
- **Migrations:** no schema change without a SQL file in `supabase/migrations/`. Apply it to Supabase **before** merging the code that uses it (migration-first).
- **Before committing, under Node 22:** `npm run typecheck` (`tsc --noEmit`), `npm run lint` (`eslint .`), `npm test` (`vitest run`). All must pass.
- Deploys are Git-driven to Vercel from `main` (production). End commits with the `Co-Authored-By` trailer.

## Guardrails
- **Do not weaken** RLS, the `is_restaurant_member`/`is_super_admin` helpers, service-role-only writes, or server-side order re-pricing. The P0-3 RLS migration self-verifies and fails if a broad write policy reappears.
- **Never query/write across tenants** — always scope by `restaurant_id` from the session.
- Customer PII (name, phone, address) is **per-tenant** and gated by consent flags (`consent_order_processing` / `consent_marketing`). Do not reuse or share customer data across tenants (PDPL/consent).
- Public order creation is locked to the service-role RPC; do not add anon/authenticated insert policies.
