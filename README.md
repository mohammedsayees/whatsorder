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
5. Order is saved to Supabase with status `New`.
6. WhatsOrder generates a structured WhatsApp message.
7. WhatsApp opens through `https://wa.me/<restaurant_whatsapp_number>?text=<encoded_order_message>`.
8. Restaurant staff manage the order in `/admin`.

## Local Setup

Use Node.js `20.9` or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open:

- Landing page: `http://localhost:3000`
- Chai Xpress menu: `http://localhost:3000/r/chaixpress`
- Admin dashboard: `http://localhost:3000/admin`

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG=chaixpress
NEXT_PUBLIC_DEMO_WHATSAPP_NUMBER=971551150068
```

Use `SUPABASE_SERVICE_ROLE_KEY` only on the server. Never expose it in browser code, screenshots, or client-side environment variables.

## Supabase

Run the schema and seed file:

```text
supabase/schema.sql
```

More setup details are in [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

## Delivery Location

Checkout supports optional browser geolocation and manual address entry. See [LOCATION_FEATURE.md](LOCATION_FEATURE.md) for stored fields, Google Maps URL generation, and future Google Places ideas.

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
- Optional customer location capture
- Consent capture
- Click-to-WhatsApp
- Supabase order persistence
- Customer creation/update by phone number
- Admin orders, menu, customers, settings, and analytics

Not included in V1:

- Marketplace
- Payment gateway
- WhatsApp Business API
- Delivery fleet
- Subscription billing

The code includes comments and structure for adding payments, WhatsApp Business API, loyalty, campaigns, subscriptions, authentication, and multi-branch support later.
