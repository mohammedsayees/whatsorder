-- WhatsOrder P2: provision storage buckets deterministically
--
-- The menu and brand image upload actions (uploadMenuItemImageAction,
-- uploadRestaurantBrandImageAction in src/app/actions.ts) lazily call
-- storage.createBucket(...) on first upload. That makes bucket existence and
-- their public/size/MIME settings depend on whichever upload happens first.
--
-- This migration creates both buckets up front with the exact limits the app
-- expects, so the first upload in a fresh project succeeds without relying on
-- the runtime fallback. The application's createBucket fallback remains as a
-- safety net for projects that have not run this migration.
--
-- Buckets are public-read (images are rendered on the public customer menu).
-- Writes still flow exclusively through the service-role server actions, so no
-- anon/authenticated insert/update/delete policies are granted here.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-images',
  'menu-images',
  true,
  2 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restaurant-assets',
  'restaurant-assets',
  true,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Rollback consideration:
-- Removing the buckets would orphan existing image URLs. If rolling back the
-- app, leave these buckets in place. The runtime createBucket fallback means
-- the application continues to work whether or not this migration was applied.
