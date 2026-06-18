-- WhatsOrder verified completed-order feedback
-- Run after fulfilment_options_migration.sql.

alter table public.restaurants
add column if not exists public_reviews_enabled boolean not null default false;

create table if not exists public.feedback_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id)
);

create table if not exists public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  tags text[] not null default '{}',
  comment text,
  customer_display_name text not null default 'Anonymous',
  is_verified_order boolean not null default true,
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'hidden')),
  restaurant_response text,
  submitted_at timestamptz not null default now(),
  published_at timestamptz,
  unique (order_id)
);

create index if not exists idx_feedback_requests_token
on public.feedback_requests(token_hash);

create index if not exists idx_customer_feedback_restaurant_submitted
on public.customer_feedback(restaurant_id, submitted_at desc);

create index if not exists idx_customer_feedback_public
on public.customer_feedback(restaurant_id, moderation_status, published_at desc);

alter table public.feedback_requests enable row level security;
alter table public.customer_feedback enable row level security;

-- Feedback request tokens are service-role only.

drop policy if exists "Restaurant users can read own feedback"
on public.customer_feedback;
create policy "Restaurant users can read own feedback"
on public.customer_feedback for select
using (
  is_restaurant_member(
    customer_feedback.restaurant_id,
    array['restaurant_admin', 'owner', 'manager', 'staff']
  )
);

drop policy if exists "Restaurant managers can moderate own feedback"
on public.customer_feedback;
create policy "Restaurant managers can moderate own feedback"
on public.customer_feedback for update
using (
  is_restaurant_member(
    customer_feedback.restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
)
with check (
  is_restaurant_member(
    customer_feedback.restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
);

drop policy if exists "Public can read approved feedback"
on public.customer_feedback;

-- Public review rendering is performed server-side with a curated response.
-- Direct anonymous access remains disabled so order IDs and moderation data are not exposed.

notify pgrst, 'reload schema';
