# Supabase Setup

This project uses Supabase for restaurants, menus, orders, customers, and future admin access.

## 1. Create Project

Create a Supabase project and copy:

- Project URL
- Anon key
- Service role key

Add them to `.env.local` locally and to Vercel Environment Variables in production.

## 2. Run SQL

Open Supabase SQL Editor and run:

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
supabase/migrations/20260620161000_p0_2a_add_public_restaurant_projection.sql
supabase/migrations/20260620162000_p0_2b_enforce_public_restaurant_projection.sql
supabase/migrations/20260620163000_p0_3_least_privilege_rls.sql
supabase/migrations/20260620163100_p0_3_allow_public_policy_helpers.sql
supabase/migrations/20260621100000_p0_4_tenant_consistent_foreign_keys.sql
supabase/migrations/20260621120000_lightweight_shift_cash_summary.sql
supabase/migrations/20260713000000_security_and_reliability_fixes.sql
```

For an existing project, apply only files that have not already been executed.
Application deployments do not require rerunning `schema.sql`. The Realtime
migration is required for restaurant-scoped new-order sound alerts.

The SQL creates:

- `restaurants`
- `menu_categories`
- `menu_items`
- `orders`
- `customers`
- `restaurant_users`

It also creates:

- `order_status` enum
- `payment_method` enum
- `updated_at` triggers
- RLS policies
- Chai Xpress seed data

## 3. Chai Xpress Seed

Seeded restaurant:

- Name: Chai Xpress
- Slug: `chaixpress`
- Address: Al Rawda 3, Ajman, UAE
- Currency: AED
- WhatsApp number: configurable in `restaurants.whatsapp_number`

Seeded categories:

1. Tea & Hot Drinks
2. Shawarma
3. Burgers
4. Sandwiches & Rolls
5. Snacks
6. Juices
7. Combos

Seeded menu:

- Karak Tea — AED 2
- Sulaimani Tea — AED 1
- Ginger Tea — AED 2
- Zafran Tea — AED 3
- Chicken Shawarma — AED 6
- Spicy Chicken Shawarma — AED 7
- Shawarma Plate — AED 15
- Zinger Burger — AED 12
- Chicken Burger — AED 8
- Beef Burger — AED 10
- Double Zinger Burger — AED 16
- Porotta Roll — AED 7
- Oman Chips Porotta — AED 5
- Chicken Club Sandwich — AED 12
- Loaded Fries — AED 12
- French Fries — AED 6
- Chicken Nuggets — AED 10
- Fresh Lime Juice — AED 8
- Orange Juice — AED 10
- Avocado Juice — AED 12
- Shawarma + Karak Combo — AED 7
- Zinger Burger + Fries + Karak — AED 18
- 3 Shawarma Offer — AED 12

## 4. RLS Policy Summary

Public users can:

- Read a curated active-restaurant projection through `get_public_restaurant`
- Read active categories
- Read available menu items

Public and authenticated Supabase clients cannot insert directly into `orders`.
Customer checkout must use the Next.js server action, which validates the order
and calls the service-role-only `create_order_with_customer_v4` RPC.

Authenticated restaurant users have tenant-scoped, role-appropriate reads.
All writes use authenticated server actions and service-role-only RPCs; direct
browser/JWT table mutations are revoked by the least-privilege migration.

The current app uses server actions with `SUPABASE_SERVICE_ROLE_KEY` for admin operations and customer/order persistence. This keeps the service key server-only.

The security hardening migration also creates:

- transactional order and customer persistence
- database-backed public order rate limiting
- service-role-only security functions
- active membership indexes and corrected loyalty permissions

The final public-order lockdown migration removes the legacy anonymous order
insert policy and revokes direct order inserts from `PUBLIC`, `anon`, and
`authenticated`.

## 5. Storage Bucket Notes

For menu images, create a public Supabase Storage bucket later:

```text
menu-images
```

Recommended path pattern:

```text
restaurants/<restaurant_slug>/menu/<item_id>.jpg
```

Store the public image URL in `menu_items.image_url`.

Keep image upload admin-only when authentication is added.
