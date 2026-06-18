# WhatsOrder Super Admin Setup

The Super Admin area manages multiple restaurant accounts, onboarding, plans, menu visibility,
recent orders, customers, QR codes, and internal notes.

## Routes

- `/super-admin` - portfolio overview
- `/super-admin/restaurants` - searchable restaurant list
- `/super-admin/restaurants/new` - restaurant onboarding form
- `/super-admin/restaurants/[id]` - restaurant workspace
- `/super-admin/onboarding` - incomplete onboarding queue
- `/super-admin/login` - secure Supabase Auth login

## Database Migration

Run this file in the Supabase SQL Editor:

```text
supabase/super_admin_migration.sql
```

The migration:

- creates `profiles`
- creates `onboarding_tasks`
- adds owner, city, branding, status, plan, fulfilment, and notes fields to `restaurants`
- updates restaurant user roles
- adds Super Admin RLS policies
- initializes onboarding tasks for existing restaurants

## Create the First Super Admin

1. In Supabase, open **Authentication > Users**.
2. Create a user with email and password.
3. Run the following in the SQL Editor:

```sql
update profiles
set role = 'super_admin',
    full_name = 'WhatsOrder Owner'
where email = 'your-email@example.com';
```

4. Open `/super-admin/login` and sign in.

Do not place the Super Admin password or service role key in frontend environment variables.

## Restaurant Admin Access

The existing `/admin` routes now require authentication and redirect unauthenticated visitors to
`/admin-login`.

After creating a restaurant owner in Supabase Authentication, connect the user to the configured
pilot restaurant:

```sql
update restaurant_users
set user_id = (
  select id from auth.users where email = 'owner@example.com'
),
role = 'restaurant_admin'
where restaurant_id = (
  select id from restaurants where slug = 'chaixpress'
)
and email = 'owner@example.com';
```

The current restaurant console intentionally remains bound to
`NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG`. A membership for another restaurant cannot access or mutate
the default restaurant. Super Admin can still review every restaurant from `/super-admin`.

## Environment Variables

Use the existing Supabase variables and add the public application URL:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

`SUPABASE_SERVICE_ROLE_KEY` remains server-only. Super Admin browser requests receive only an
HTTP-only Supabase access-token cookie after role verification.

## Restaurant Creation

Creating a restaurant:

1. inserts the restaurant record
2. normalizes UAE WhatsApp numbers to international format
3. creates the public `/r/[slug]` link
4. creates the onboarding checklist
5. records the owner email in `restaurant_users`

The owner still needs a Supabase Auth user and matching `restaurant_users.user_id` before a fully
authenticated restaurant-admin portal is enabled.

## Public Menu Status

Public menus are available for operational statuses:

- `live`
- `trial`
- `paid`

Draft, onboarding, paused, and cancelled restaurants are hidden from public menu lookup.

## QR Codes

QR codes are generated in the browser using the `qrcode` package. No restaurant URL is sent to an
external QR service. Super Admin can copy the public link or download a PNG.

## Current Menu Management Context

The existing `/admin/menu` route remains connected to `NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG`.
The Super Admin restaurant workspace shows menu inventory for every restaurant and opens the
existing menu manager for the configured default pilot. A later authenticated restaurant-context
switcher can extend the same menu manager to every assigned restaurant without duplicating menu
logic.
