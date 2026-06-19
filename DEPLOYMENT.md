# Deployment

Recommended production setup:

- GitHub repository: source code
- Vercel: Next.js hosting
- Supabase: database and future storage

## 1. Push Code

Push the project to GitHub.

## 2. Create Supabase Project

Run the SQL files listed in `SUPABASE_SETUP.md` in order. For an existing
Supabase project, run only migrations that have not previously been applied.

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
NEXT_PUBLIC_APP_URL=https://your-domain.com
ENABLE_DEMO_DATA=false
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
- Confirm owner invitation email opens the production `/auth/invite` URL.
- Confirm the invited owner can set a password and sign in.
- Confirm a manager/staff account can be revoked and immediately loses dashboard access.
- Enable sound alerts on the restaurant device and place an order from another device.
- Confirm the Realtime indicator says `Live`, the sound plays, and the order is highlighted.
- Leave a dashboard open for more than one hour and place another test order.
- Complete an order, send a feedback request, submit it, approve it, and verify it publicly.
- Test every enabled fulfilment option, including table number and car plate requirements.
- Pause the restaurant and confirm its public menu and dashboard access become unavailable.

## 7. Security Notes

- Do not commit `.env.local`.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY`.
- Restaurant and Super Admin routes are protected by Supabase Auth and HTTP-only cookies.
- Configure Supabase Authentication Site URL and allowed redirect URLs for the production domain.
- Configure dependable Supabase Auth email delivery/SMTP before sending owner invitations.
- Keep `ENABLE_DEMO_DATA=false` in production so database failures cannot show pilot data.
- Keep a rollback plan and verify Supabase backups before onboarding live restaurants.
