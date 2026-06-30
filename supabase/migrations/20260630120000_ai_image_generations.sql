-- WhatsOrder: log + cost tracking for AI-generated menu item images
--
-- Records every AI food-image generation kicked off from the admin menu editor
-- (generateMenuItemImageAction). Used for (a) a soft per-restaurant daily cap so
-- generation cost can't run away, and (b) an audit trail of which prompt/model
-- produced which image. Prompts are operational data — they are read only on the
-- staff/admin path and never surfaced on customer-facing pages.
--
-- Writes happen only through the authenticated service-role server action;
-- authenticated JWT access is read-only and tenant-scoped (mirrors
-- order_payment_events / order_status_events).

create table if not exists public.ai_image_generations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google',
  model text not null,
  prompt text not null,
  style_preset text not null,
  image_url text not null,
  storage_public_id text,
  status text not null default 'generated' check (status in ('generated', 'confirmed', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

-- Powers the per-restaurant daily-cap count (restaurant_id + created_at window).
create index if not exists idx_ai_image_generations_restaurant_created
on public.ai_image_generations(restaurant_id, created_at desc);

-- Powers "latest generations for this item" lookups in the editor.
create index if not exists idx_ai_image_generations_item_created
on public.ai_image_generations(menu_item_id, created_at desc);

alter table public.ai_image_generations enable row level security;

drop policy if exists "Restaurant users can read own ai image generations"
on public.ai_image_generations;
create policy "Restaurant users can read own ai image generations"
on public.ai_image_generations for select
using (public.is_restaurant_member(ai_image_generations.restaurant_id));

drop policy if exists "Super admins can read all ai image generations"
on public.ai_image_generations;
create policy "Super admins can read all ai image generations"
on public.ai_image_generations for select
using (public.is_super_admin());

revoke all on table public.ai_image_generations from anon, authenticated;
grant select on table public.ai_image_generations to authenticated;

notify pgrst, 'reload schema';
