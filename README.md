# WhatsOrder

WhatsOrder is a lightweight WhatsApp ordering and order management system for small restaurants in the UAE.

It does not replace WhatsApp. It gives restaurants a public menu link, structured checkout, click-to-WhatsApp order messages, order tracking, customer history, and simple analytics.

## Current Pilot

- Restaurant: Chai Xpress
- Slug: `chaixpress`
- Public menu URL: `/r/chaixpress`
- Location: Al Rawda 3, Ajman, UAE
- Currency: AED

The app remains multi-restaurant ready because every restaurant-owned table includes `restaurant_id`.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase
- Vercel
- PWA-friendly metadata and manifest

## Core Flow

1. Customer opens `/r/chaixpress`.
2. Customer adds menu items to cart.
3. Customer enters contact, delivery, payment, and consent details.
4. Customer can optionally share current location, generating a Google Maps delivery link.
5. Order and customer totals are saved atomically to Supabase with status `New`.
6. WhatsOrder generates a structured WhatsApp message.
7. WhatsApp opens with the restaurant number and encoded order message.
8. Restaurant staff manage the order in `/admin`.

## Local Setup

Use Node.js `20.9` or newer.

```bash
nvm use
npm install
cp .env.example .env.local
npm run dev
```

Open:

- Landing page: `http://localhost:3000`
- Chai Xpress menu: `http://localhost:3000/r/chaixpress`
- Admin dashboard: `http://localhost:3000/admin`
- Restaurant admin login: `http://localhost:3000/admin-login`
- Super Admin login: `http://localhost:3000/super-admin/login`

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG=chaixpress
NEXT_PUBLIC_DEMO_WHATSAPP_NUMBER=971551150068
NEXT_PUBLIC_APP_URL=http://localhost:3000
ENABLE_DEMO_DATA=false
```

Use `SUPABASE_SERVICE_ROLE_KEY` only on the server. Never expose it in browser code, screenshots, or client-side environment variables.

## Supabase

Run the schema and migrations in this order:

```text
supabase/schema.sql
supabase/customer_profile_loyalty_migration.sql
supabase/super_admin_migration.sql
supabase/security_hardening_migration.sql
supabase/fulfilment_options_migration.sql
supabase/arabic_menu_fields_migration.sql
supabase/customer_feedback_migration.sql
supabase/dine_in_migration.sql
supabase/new_order_realtime_migration.sql
supabase/menu_offers_migration.sql
supabase/pilot_launch_hardening_migration.sql
supabase/20260620_lock_down_public_order_creation.sql
supabase/20260620_p1_pilot_operations.sql
```

More setup details are in [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

For an existing Supabase project, do not rerun `schema.sql` merely because the
application code changed. Apply only migrations that have not already been run,
in the order shown above.

## Super Admin

The protected Super Admin area supports multi-restaurant setup, onboarding, plans, QR codes, and
portfolio-level reporting. Run `supabase/super_admin_migration.sql`, create a Supabase Auth user,
and promote its profile to `super_admin`.

Restaurant owners, managers, and staff use the shared `/admin-login` endpoint. Their assigned
restaurant is resolved from `restaurant_users`, so each account sees only its own dashboard data.

See [SUPER_ADMIN_SETUP.md](SUPER_ADMIN_SETUP.md) for the complete setup and security notes.

## Delivery Location

Checkout supports optional browser geolocation and manual address entry. See [LOCATION_FEATURE.md](LOCATION_FEATURE.md) for stored fields, Google Maps URL generation, and future Google Places ideas.

## Customer Profiles and Loyalty

Admins can view customer order history, and completed orders can award future-ready loyalty points.
Public saved-address lookup is disabled because a phone number alone is not sufficient identity
verification. It should only return after customer OTP or account authentication is added. See
[CUSTOMER_PROFILE_AND_LOYALTY.md](CUSTOMER_PROFILE_AND_LOYALTY.md).

## Menu Images

Restaurant staff can upload optional menu item images from their phone or laptop through Supabase Storage. See [MENU_IMAGE_UPLOAD.md](MENU_IMAGE_UPLOAD.md).

## Deployment

The recommended deployment is:

- GitHub for source control
- Vercel for hosting
- Supabase for database and future image storage

See [DEPLOYMENT.md](DEPLOYMENT.md).

## Pilot Testing

Use [PILOT_TESTING.md](PILOT_TESTING.md) to test the live flow with Chai Xpress staff and customers.

## Commands

```bash
npm run lint
npm run typecheck
npm run build
```

## V1 Scope

Included:

- Multi-restaurant data model
- Public restaurant menu route
- Cart and checkout
- Delivery, takeaway, Bring to My Car, and table-aware Dine In fulfilment
- Bilingual, swipeable promotional offers linked to server-validated menu pricing
- Verified completed-order feedback with restaurant moderation
- Optional customer location capture
- Restaurant-side customer history
- Consent capture
- Click-to-WhatsApp
- Supabase order persistence
- Customer creation/update by phone number
- Loyalty points foundation for completed orders
- Admin orders, menu, customers, settings, and analytics

Not included in V1:

- Marketplace
- Payment gateway
- WhatsApp Business API
- Delivery fleet
- Subscription billing

The code includes comments and structure for adding payments, WhatsApp Business API, campaigns,
subscriptions, and multi-branch support later.
