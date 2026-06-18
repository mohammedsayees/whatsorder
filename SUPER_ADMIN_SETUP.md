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
supabase/security_hardening_migration.sql
supabase/fulfilment_options_migration.sql
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

When Super Admin creates a restaurant with an owner email and leaves **Send owner invitation**
enabled:

1. Supabase Auth creates the invited user.
2. WhatsOrder links that user to the restaurant in `restaurant_users`.
3. The owner receives an email invitation.
4. The invitation opens `/auth/invite`.
5. The owner creates a password at `/auth/setup-password`.
6. The owner signs in later at `/admin-login`.
7. `/admin` resolves the restaurant from the authenticated membership.

Super Admin can resend or relink the owner from the restaurant Overview tab. The same page can
invite managers and staff members.

Roles:

- `restaurant_admin` - dashboard, orders, menu, customers, and settings
- `manager` - dashboard, orders, menu, customers, and settings
- `staff` - dashboard, orders, and menu; customer database and settings are restricted

Every admin query and mutation uses the authenticated user’s `restaurant_users.restaurant_id`.
`NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG` remains only for pilot/demo defaults and is no longer used to
select restaurant-admin data.

Memberships must have `accepted_at` set before dashboard access is granted. Paused and cancelled
restaurants cannot enter the restaurant dashboard. Accounts linked to more than one restaurant are
rejected until the restaurant selector flow is implemented, preventing an arbitrary tenant from
being selected.

## Supabase Invitation URLs

In Supabase open **Authentication > URL Configuration**.

Set the Site URL to your production domain:

```text
https://whatsorder-taupe.vercel.app
```

Add these Redirect URLs:

```text
http://localhost:3000/auth/invite
https://whatsorder-taupe.vercel.app/auth/invite
```

Use your custom production domain too when one is added. Supabase will reject or replace invitation
redirects that are not included in this allow list.

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
6. optionally sends the owner account invitation immediately

## Public Menu Status

Public menus are available for operational statuses:

- `live`
- `trial`
- `paid`

Draft, onboarding, paused, and cancelled restaurants are hidden from public menu lookup.

## QR Codes

QR codes are generated in the browser using the `qrcode` package. No restaurant URL is sent to an
external QR service. Super Admin can copy the public link or download a PNG.

## Menu Onboarding

Super Admin can manage each restaurant menu directly from:

```text
/super-admin/restaurants/[id]?tab=menu
```

The workspace reuses the existing menu manager and supports CSV import, sample templates, manual
categories/items, ordering, availability, editing, and device image uploads. The selected
`restaurant_id` is accepted only after server-side Super Admin verification.

The restaurant-facing `/admin/menu` route automatically uses the logged-in user’s assigned
restaurant.
