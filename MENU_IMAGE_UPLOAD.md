# Menu Image Upload

WhatsOrder supports optional device image uploads for menu items using Supabase Storage.

## Bucket Setup

Create a Supabase Storage bucket named:

```text
menu-images
```

Recommended settings:

- Public bucket: enabled
- File size limit: 2MB
- Allowed MIME types:
  - `image/jpeg`
  - `image/png`
  - `image/webp`

The app also attempts to create the bucket from the server upload action if it does not exist, but creating it manually in Supabase first is clearer for production.

## How Upload Works

In `/admin/menu`, restaurant staff can upload an image from phone or laptop while adding or editing a menu item.

The upload flow is:

1. Admin selects an image file.
2. The browser sends the file to a Next.js server action.
3. The server action validates type and size.
4. The server uploads the file to Supabase Storage using `SUPABASE_SERVICE_ROLE_KEY`.
5. Supabase returns a public URL.
6. WhatsOrder saves that public URL into:

```text
menu_items.image_url
```

The service role key is never exposed to frontend browser code.

## Storage Path

Images are stored under:

```text
restaurants/<restaurantSlug>/<menuItemSlug>-<timestamp>.<extension>
```

Example:

```text
restaurants/chaixpress/karak-tea-1781539200000.jpg
```

## Allowed Formats

Allowed:

- JPG
- JPEG
- PNG
- WebP

Maximum size:

```text
2MB
```

Recommended image size:

```text
1200 x 800px
```

Landscape food photos work best because the customer menu uses a fixed-height, `object-cover` card image.

## Storage Policies

For the current MVP, uploads go through server actions with the service role key, so browser upload policies are not required.

You still need public read access so customers can see images:

```sql
create policy "Public can read menu images"
on storage.objects for select
using (bucket_id = 'menu-images');
```

Future authenticated admin upload policy example:

```sql
create policy "Authenticated users can upload menu images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'menu-images');
```

Future authenticated admin update/delete policy example:

```sql
create policy "Authenticated users can update menu images"
on storage.objects for update
to authenticated
using (bucket_id = 'menu-images')
with check (bucket_id = 'menu-images');

create policy "Authenticated users can delete menu images"
on storage.objects for delete
to authenticated
using (bucket_id = 'menu-images');
```

Once Supabase Auth is connected to `restaurant_users`, tighten these policies so admins can only manage files under their own restaurant folder.

## Troubleshooting

If images do not show on the customer menu:

1. Check `menu_items.image_url` in Supabase Table Editor.
2. Open the saved URL directly in a browser.
3. Confirm the `menu-images` bucket is public or has a public read policy.
4. Confirm the file is JPG, PNG, or WebP.
5. Confirm the file is under 2MB.
6. Re-save the menu item after uploading or removing an image.

Cloudinary URLs still work through the advanced manual URL field.
