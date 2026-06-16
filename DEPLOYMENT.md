# Deployment

Recommended production setup:

- GitHub repository: source code
- Vercel: Next.js hosting
- Supabase: database and future storage

## 1. Push Code

Push the project to GitHub.

## 2. Create Supabase Project

Run `supabase/schema.sql` in Supabase SQL Editor.

Confirm these rows exist:

- `restaurants.slug = chaixpress`
- Chai Xpress menu categories
- Chai Xpress menu items

## 3. Deploy to Vercel

Import the GitHub repository into Vercel.

Vercel should detect:

```text
Framework: Next.js
Build command: npm run build
```

## 4. Add Vercel Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG=chaixpress
NEXT_PUBLIC_DEMO_WHATSAPP_NUMBER=971551150068
```

Redeploy after adding or changing environment variables.

## 5. Production URLs

Public menu:

```text
https://your-domain/r/chaixpress
```

Admin:

```text
https://your-domain/admin
```

## 6. Pre-Pilot Checks

Before sharing the restaurant link:

- Confirm `/r/chaixpress` loads from Supabase.
- Confirm WhatsApp number in `restaurants.whatsapp_number`.
- Place one test order.
- Confirm the order appears in `/admin/orders`.
- Change order status and confirm it saves.
- Confirm customer record was created or updated.

## 7. Security Notes

- Do not commit `.env.local`.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY`.
- Keep admin URLs private until authentication is added.
- Add Supabase Auth before onboarding multiple restaurant operators.
