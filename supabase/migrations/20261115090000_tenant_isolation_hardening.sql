-- Tenant isolation hardening (pre-scale audit findings 9, 14, 16 + indexes).
-- Migration-first: safe to apply BEFORE the matching app code is deployed;
-- the code that uses these tables ships in the same PR.
--
--   9  customer_link_token_uses      one-time customer login links
--      customer_session_revocations  staff can sign a customer out everywhere
--   14 restaurant_internal_notes     super-admin notes off the restaurants row
--                                    (members can read restaurants via RLS)
--   16 restaurant_slug_history       a slug freed by a rename stays with its
--                                    restaurant: old QR codes can't be taken
--      + order_id indexes for cascade deletes, created_at for rate-limit cleanup
--
-- All new tables: RLS on, no policies, service_role only.

-- ---------------------------------------------------------------------------
-- 9. One-time login links and session revocation
-- ---------------------------------------------------------------------------
create table if not exists public.customer_link_token_uses (
  jti uuid primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  used_at timestamptz not null default now()
);
create index if not exists idx_customer_link_token_uses_used_at
  on public.customer_link_token_uses(used_at);

create table if not exists public.customer_session_revocations (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  phone text not null,
  revoked_before timestamptz not null,
  revoked_by uuid,
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, phone)
);

-- ---------------------------------------------------------------------------
-- 14. Internal (super-admin) notes move off the member-readable row
-- ---------------------------------------------------------------------------
create table if not exists public.restaurant_internal_notes (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  notes text not null,
  updated_at timestamptz not null default now()
);

insert into public.restaurant_internal_notes (restaurant_id, notes)
select id, internal_notes
from public.restaurants
where nullif(btrim(internal_notes), '') is not null
on conflict (restaurant_id) do update
  set notes = excluded.notes, updated_at = now();

-- Until every deployment uses the new table, any write to the old column is
-- moved into it and the column is kept empty, so members never read notes.
create or replace function public.move_restaurant_internal_notes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $move_notes$
begin
  if new.internal_notes is not null then
    if btrim(new.internal_notes) = '' then
      delete from public.restaurant_internal_notes where restaurant_id = new.id;
    else
      insert into public.restaurant_internal_notes (restaurant_id, notes)
      values (new.id, new.internal_notes)
      on conflict (restaurant_id) do update
        set notes = excluded.notes, updated_at = now();
    end if;
    new.internal_notes := null;
  end if;
  return new;
end
$move_notes$;
revoke all on function public.move_restaurant_internal_notes() from public, anon, authenticated;

drop trigger if exists restaurants_move_internal_notes on public.restaurants;
-- Notes are only ever written by an UPDATE (the super-admin notes form), so
-- BEFORE UPDATE covers every old-code path.
create trigger restaurants_move_internal_notes
before update of internal_notes on public.restaurants
for each row execute function public.move_restaurant_internal_notes();

update public.restaurants set internal_notes = null where internal_notes is not null;

-- ---------------------------------------------------------------------------
-- 16. Slug history: a renamed restaurant keeps its old links
-- ---------------------------------------------------------------------------
create table if not exists public.restaurant_slug_history (
  slug text primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  released_at timestamptz not null default now()
);
create index if not exists idx_restaurant_slug_history_restaurant
  on public.restaurant_slug_history(restaurant_id);

create or replace function public.guard_restaurant_slug_reuse()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $guard_slug$
begin
  if exists (
    select 1 from public.restaurant_slug_history h
    where h.slug = new.slug and h.restaurant_id <> new.id
  ) then
    raise exception 'That store link is already taken (restaurants_slug_key: it belonged to another restaurant)'
      using errcode = '23505';
  end if;
  return new;
end
$guard_slug$;

create or replace function public.record_restaurant_slug_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $record_slug$
begin
  if old.slug is distinct from new.slug and old.slug not like 'demo-%' then
    insert into public.restaurant_slug_history (slug, restaurant_id)
    values (old.slug, old.id)
    on conflict (slug) do update
      set released_at = now()
      where public.restaurant_slug_history.restaurant_id = excluded.restaurant_id;
  end if;
  return null;
end
$record_slug$;

revoke all on function public.guard_restaurant_slug_reuse() from public, anon, authenticated;
revoke all on function public.record_restaurant_slug_change() from public, anon, authenticated;

drop trigger if exists restaurants_guard_slug_reuse on public.restaurants;
create trigger restaurants_guard_slug_reuse
before insert or update of slug on public.restaurants
for each row execute function public.guard_restaurant_slug_reuse();

drop trigger if exists restaurants_record_slug_change on public.restaurants;
create trigger restaurants_record_slug_change
after update of slug on public.restaurants
for each row execute function public.record_restaurant_slug_change();

-- ---------------------------------------------------------------------------
-- Access: service role only
-- ---------------------------------------------------------------------------
alter table public.customer_link_token_uses enable row level security;
alter table public.customer_session_revocations enable row level security;
alter table public.restaurant_internal_notes enable row level security;
alter table public.restaurant_slug_history enable row level security;

revoke all on public.customer_link_token_uses from anon, authenticated;
revoke all on public.customer_session_revocations from anon, authenticated;
revoke all on public.restaurant_internal_notes from anon, authenticated;
revoke all on public.restaurant_slug_history from anon, authenticated;

grant select, insert, update, delete on public.customer_link_token_uses to service_role;
grant select, insert, update, delete on public.customer_session_revocations to service_role;
grant select, insert, update, delete on public.restaurant_internal_notes to service_role;
grant select, insert, update, delete on public.restaurant_slug_history to service_role;

-- ---------------------------------------------------------------------------
-- Indexes: existing order-child indexes lead with restaurant_id, so a
-- cascade delete by order_id scanned the whole table.
-- ---------------------------------------------------------------------------
create index if not exists idx_order_status_events_order_id on public.order_status_events(order_id);
create index if not exists idx_order_print_events_order_id on public.order_print_events(order_id);
create index if not exists idx_order_payment_events_order_id on public.order_payment_events(order_id);
create index if not exists idx_order_submission_keys_order_id on public.order_submission_keys(order_id);
create index if not exists idx_order_notification_jobs_order_id on public.order_notification_jobs(order_id);
-- check_order_submission_rate_limit deletes attempts older than a day on
-- every order; without this it scanned the table each time.
create index if not exists idx_order_submission_attempts_created_at
  on public.order_submission_attempts(created_at);
