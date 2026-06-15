# WhatsOrder

WhatsOrder is a pilot-ready SaaS MVP for small UAE restaurants that already take orders through WhatsApp. It keeps WhatsApp as the ordering channel, but adds structured menus, checkout, order tracking, customer history, and simple restaurant analytics.

## What is included

- Next.js App Router, TypeScript, and Tailwind CSS
- Multi-restaurant public URLs such as `/r/chaixpress`
- Customer menu, cart, checkout, consent capture, and click-to-WhatsApp
- Supabase tables for restaurants, menus, orders, customers, and restaurant users
- Admin dashboard, order statuses, menu management, customer database, and settings
- Demo fallback data when Supabase is not configured
- PWA-friendly manifest and mobile-first UI

## Local setup

Use Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open:

- Landing page: `http://localhost:3000`
- Demo menu: `http://localhost:3000/r/chaixpress`
- Admin dashboard: `http://localhost:3000/admin`

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Add your values to `.env.local`.
4. Restart the dev server.

Required environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG=chaixpress
NEXT_PUBLIC_DEMO_WHATSAPP_NUMBER=971554822424
```

Use `SUPABASE_SERVICE_ROLE_KEY` only on the server. It powers server actions for orders, customers, menu edits, and settings updates. Public menu reads use the anon key and RLS select policies.

## Pilot notes

This V1 intentionally does not include a marketplace, payment gateway, WhatsApp Business API, or subscriptions. The code includes clear insertion points for those future features:

- WhatsApp Business API: replace the click-to-WhatsApp URL in `src/app/actions.ts`
- Payment gateway: reserve payment intent before order creation in `src/app/actions.ts`
- Loyalty points and campaigns: extend `customers` and the admin customer page
- Subscription billing and multi-branch support: extend restaurant settings and `restaurant_users`
- Authentication: connect `restaurant_users` to Supabase Auth and add user-scoped RLS policies

## Demo restaurant

The seed creates:

- Chaixpress
- Slug: `chaixpress`
- Currency: AED
- WhatsApp number: `971554822424`

Seed items:

- Karak Tea — AED 1
- Zinger Burger — AED 15
- Double Smash Burger — AED 21
- Single Smash Burger — AED 15
- Grill Chicken Burger — AED 15
- Classic Porotta Roll — AED 7
- Oman Chips Porotta — AED 3
- Chicken Loaded Fries — AED 16
- Fresh Lime Juice — AED 8
- Zinger Combo — AED 21
