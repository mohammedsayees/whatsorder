-- Optional notes-and-coins breakdown for the shift cash count.
-- Requires 20261121120000_blind_cash_count.sql.
--
-- 1. restaurant_shifts.cash_count_denominations: [{minor, count}, ...], the
--    breakdown the counted cash was made from (minor units: fils / paise).
-- 2. normalize_cash_denominations: validates a breakdown against the
--    restaurant's currency and the counted amount, and cleans it (zero counts
--    dropped, largest first). Null/empty input means no breakdown.
--    The denomination lists match src/lib/cash-denominations.ts.
-- 3. declare_shift_cash_count and close_restaurant_shift_v4 gain an optional
--    last parameter, requested_cash_denominations (default null). They are
--    re-created rather than replaced because the signature changes; calls
--    without the new parameter behave exactly as before. A breakdown locked
--    with a blind count is kept; the close does not change it.
--
-- No existing financial row is changed.

begin;
set local lock_timeout = '5s';

alter table public.restaurant_shifts
  add column if not exists cash_count_denominations jsonb;

alter table public.restaurant_shifts
  drop constraint if exists restaurant_shifts_cash_count_denominations_check;
alter table public.restaurant_shifts
  add constraint restaurant_shifts_cash_count_denominations_check check (
    cash_count_denominations is null or jsonb_typeof(cash_count_denominations) = 'array'
  );

create or replace function public.normalize_cash_denominations(
  target_restaurant_id uuid,
  requested_denominations jsonb,
  counted_amount numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $normalize_denominations$
declare
  currency text;
  allowed integer[];
  item jsonb;
  minor_value integer;
  count_value integer;
  seen integer[] := '{}';
  total_minor bigint := 0;
  cleaned jsonb;
begin
  if requested_denominations is null
     or jsonb_typeof(requested_denominations) = 'null'
     or (jsonb_typeof(requested_denominations) = 'array'
         and jsonb_array_length(requested_denominations) = 0) then
    return null;
  end if;
  if jsonb_typeof(requested_denominations) <> 'array'
     or jsonb_array_length(requested_denominations) > 20 then
    raise exception 'Enter whole numbers of notes and coins';
  end if;

  select currency_code into currency from public.restaurants where id = target_restaurant_id;
  allowed := case currency
    when 'INR' then array[50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100]
    else array[100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 100, 50, 25]
  end;

  for item in select value from jsonb_array_elements(requested_denominations) loop
    if jsonb_typeof(item) <> 'object'
       or jsonb_typeof(item->'minor') <> 'number'
       or jsonb_typeof(item->'count') <> 'number'
       or (item->>'minor')::numeric <> trunc((item->>'minor')::numeric)
       or (item->>'count')::numeric <> trunc((item->>'count')::numeric)
       or (item->>'count')::numeric < 0
       or (item->>'count')::numeric > 100000 then
      raise exception 'Enter whole numbers of notes and coins';
    end if;
    minor_value := (item->>'minor')::integer;
    count_value := (item->>'count')::integer;
    if not (minor_value = any(allowed)) or minor_value = any(seen) then
      raise exception 'Enter whole numbers of notes and coins';
    end if;
    seen := seen || minor_value;
    total_minor := total_minor + minor_value::bigint * count_value;
  end loop;

  if total_minor <> round(coalesce(counted_amount, 0) * 100) then
    raise exception 'The notes and coins do not add up to the counted cash';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('minor', minor, 'count', count)
           order by minor desc), '[]'::jsonb)
  into cleaned
  from (
    select (value->>'minor')::integer as minor, (value->>'count')::integer as count
    from jsonb_array_elements(requested_denominations)
  ) rows_in
  where count > 0;

  return case when jsonb_array_length(cleaned) = 0 then null else cleaned end;
end;
$normalize_denominations$;

drop function if exists public.declare_shift_cash_count(uuid, uuid, numeric, uuid);

create function public.declare_shift_cash_count(
  target_restaurant_id uuid,
  target_shift_id uuid,
  requested_cash_counted_amount numeric,
  event_actor_user_id uuid,
  requested_cash_denominations jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $declare_cash_count$
declare
  actor_role text;
  shift_row public.restaurant_shifts%rowtype;
  denominations jsonb;
begin
  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);

  -- Same lock as close.
  select * into shift_row from public.restaurant_shifts
  where id = target_shift_id and restaurant_id = target_restaurant_id
  for update;
  if shift_row.id is null or shift_row.status <> 'open' then
    raise exception 'Open shift not found';
  end if;
  if actor_role is null
     or (actor_role = 'staff' and shift_row.opened_by_user_id <> event_actor_user_id) then
    raise exception 'Only the shift opener or restaurant management can close this shift';
  end if;
  if shift_row.cash_count_declared_at is not null then
    raise exception 'The cash count for this shift is already locked';
  end if;
  if requested_cash_counted_amount is null or requested_cash_counted_amount < 0
     or requested_cash_counted_amount > 99999999.99 then
    raise exception 'Counted cash cannot be negative';
  end if;
  if exists (
    select 1 from public.orders
    where restaurant_id = target_restaurant_id
      and status in ('New', 'Accepted', 'Preparing', 'Ready to Serve', 'Out for Delivery')
  ) then
    raise exception 'Cannot close shift while active orders remain';
  end if;

  denominations := public.normalize_cash_denominations(
    target_restaurant_id, requested_cash_denominations, round(requested_cash_counted_amount, 2)
  );

  update public.restaurant_shifts set
    declared_cash_counted_amount = round(requested_cash_counted_amount, 2),
    cash_count_declared_at = now(),
    cash_count_declared_by_user_id = event_actor_user_id,
    cash_count_denominations = denominations
  where id = target_shift_id and restaurant_id = target_restaurant_id;
end;
$declare_cash_count$;

drop function if exists public.close_restaurant_shift_v4(
  uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid
);

create function public.close_restaurant_shift_v4(
  target_restaurant_id uuid,
  target_shift_id uuid,
  requested_cash_counted_amount numeric,
  requested_card_terminal_total numeric,
  requested_upi_reported_total numeric,
  requested_marketplace_sales jsonb,
  requested_closing_note text,
  event_actor_user_id uuid,
  requested_cash_denominations jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $close_shift_v4$
declare
  actor_role text;
  shift_row public.restaurant_shifts%rowtype;
  blind boolean;
  denominations jsonb;
begin
  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);

  select * into shift_row from public.restaurant_shifts
  where id = target_shift_id and restaurant_id = target_restaurant_id and status = 'open'
  for update;

  if shift_row.id is not null then
    if shift_row.cash_count_declared_at is not null then
      if requested_cash_counted_amount is null
         or round(requested_cash_counted_amount, 2) <> shift_row.declared_cash_counted_amount then
        raise exception 'Close with the locked cash count';
      end if;
      -- The breakdown, if any, was locked with the count.
    else
      select coalesce(blind_cash_count, true) into blind
      from public.restaurants where id = target_restaurant_id;
      if blind and actor_role = 'staff' then
        raise exception 'Lock the cash count before closing';
      end if;

      denominations := public.normalize_cash_denominations(
        target_restaurant_id, requested_cash_denominations,
        round(coalesce(requested_cash_counted_amount, 0), 2)
      );
      -- Rolled back with the close if v3 refuses it.
      update public.restaurant_shifts set cash_count_denominations = denominations
      where id = target_shift_id and restaurant_id = target_restaurant_id;
    end if;
  end if;

  -- Unchanged close; it re-checks the shift, role, totals and notes.
  return public.close_restaurant_shift_v3(
    target_restaurant_id, target_shift_id, requested_cash_counted_amount,
    requested_card_terminal_total, requested_upi_reported_total,
    requested_marketplace_sales, requested_closing_note, event_actor_user_id
  );
end;
$close_shift_v4$;

revoke all on function public.normalize_cash_denominations(uuid, jsonb, numeric)
from public, anon, authenticated;
grant execute on function public.normalize_cash_denominations(uuid, jsonb, numeric) to service_role;
revoke all on function public.declare_shift_cash_count(uuid, uuid, numeric, uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.declare_shift_cash_count(uuid, uuid, numeric, uuid, jsonb)
to service_role;
revoke all on function public.close_restaurant_shift_v4(
  uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.close_restaurant_shift_v4(
  uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid, jsonb
) to service_role;

comment on column public.restaurant_shifts.cash_count_denominations is
  'Optional notes-and-coins breakdown of the counted cash: [{minor, count}] in fils/paise.';

notify pgrst, 'reload schema';

commit;

-- Rollback: re-apply both functions from 20261121120000_blind_cash_count.sql
-- (drop these 5- and 9-argument versions first), drop
-- normalize_cash_denominations, then drop the constraint and column.
