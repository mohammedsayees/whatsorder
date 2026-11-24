-- Rider delivery completion + rider cash ledger.
--
-- 1. The rider's private link can now mark an order picked up / delivered /
--    not deliverable. All three go through one service-role-only RPC that
--    re-checks the assignment, locks the order, records the payment actually
--    collected and moves the order through the normal status transition
--    (actor role 'rider', no user id).
-- 2. rider_cash_entries is an append-only ledger of cash held by each rider:
--    floats and change advances out of the till, cash collected on delivery
--    (net of change given) and handovers back. A rider's balance is the sum
--    of their entries.
-- 3. close_restaurant_shift_v5 wraps v4 and refuses to close while any rider
--    still holds cash, so the till count stays honest.
--
-- Writes are service-role only; authenticated restaurant members get
-- tenant-scoped read access. Apply before deploying the code that uses it.

-- ---------------------------------------------------------------------------
-- Assignment outcome columns
-- ---------------------------------------------------------------------------

alter table public.order_rider_assignments
  add column if not exists picked_up_at timestamptz,
  add column if not exists outcome text,
  add column if not exists outcome_at timestamptz,
  add column if not exists failure_reason text,
  add column if not exists tendered_amount numeric(10, 2),
  add column if not exists collected_method text,
  add column if not exists method_changed boolean not null default false;

do $assignment_outcome_checks$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_rider_assignments'::regclass
      and conname = 'order_rider_assignments_outcome_values'
  ) then
    alter table public.order_rider_assignments
      add constraint order_rider_assignments_outcome_values
      check (outcome is null or outcome in ('delivered', 'failed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_rider_assignments'::regclass
      and conname = 'order_rider_assignments_collection_values'
  ) then
    alter table public.order_rider_assignments
      add constraint order_rider_assignments_collection_values
      check (
        (tendered_amount is null or tendered_amount >= 0)
        and (collected_method is null
          or collected_method in ('Cash on Delivery', 'Card on Delivery'))
        and (failure_reason is null or char_length(failure_reason) <= 200)
      );
  end if;
end
$assignment_outcome_checks$;

-- ---------------------------------------------------------------------------
-- Rider cash ledger (append-only)
-- ---------------------------------------------------------------------------

create table if not exists public.rider_cash_entries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  rider_id uuid not null,
  entry_type text not null
    check (entry_type in (
      'float_issued',
      'change_advance',
      'order_cash',
      'handover',
      'variance'
    )),
  -- Positive = cash the rider now holds; negative = cash leaving the rider.
  amount numeric(10, 2) not null
    check (amount <> 0 and abs(amount) <= 100000),
  order_id uuid,
  assignment_id uuid
    references public.order_rider_assignments(id) on delete set null,
  note text check (note is null or char_length(note) <= 300),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  created_at timestamptz not null default now(),
  constraint rider_cash_entries_rider_tenant_fk
    foreign key (rider_id, restaurant_id)
    references public.delivery_riders(id, restaurant_id),
  constraint rider_cash_entries_order_tenant_fk
    foreign key (order_id, restaurant_id)
    references public.orders(id, restaurant_id)
    on delete set null (order_id),
  constraint rider_cash_entries_sign
    check (
      (entry_type in ('float_issued', 'change_advance', 'order_cash') and amount > 0)
      or (entry_type = 'handover' and amount < 0)
      or entry_type = 'variance'
    )
);

create index if not exists idx_rider_cash_entries_rider
  on public.rider_cash_entries(restaurant_id, rider_id, created_at desc);

create index if not exists idx_rider_cash_entries_order
  on public.rider_cash_entries(restaurant_id, order_id)
  where order_id is not null;

-- A delivery can credit its collected cash only once.
create unique index if not exists rider_cash_entries_one_order_cash
  on public.rider_cash_entries(assignment_id)
  where entry_type = 'order_cash' and assignment_id is not null;

alter table public.rider_cash_entries enable row level security;

drop policy if exists rider_cash_entries_tenant_read on public.rider_cash_entries;
create policy rider_cash_entries_tenant_read
on public.rider_cash_entries for select to authenticated
using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

revoke all on table public.rider_cash_entries
from public, anon, authenticated, service_role;
grant select on table public.rider_cash_entries to authenticated;
-- No update/delete: corrections are new entries.
grant select, insert on table public.rider_cash_entries to service_role;

comment on table public.rider_cash_entries is
  'Append-only ledger of cash held by delivery riders. Balance = sum(amount).';

-- Current balance per rider (only riders with entries).
create or replace function public.get_rider_cash_balances(target_restaurant_id uuid)
returns table (rider_id uuid, balance numeric)
language sql
stable
security invoker
set search_path = ''
as $rider_balances$
  select entries.rider_id, sum(entries.amount)::numeric(10, 2) as balance
  from public.rider_cash_entries as entries
  where entries.restaurant_id = target_restaurant_id
  group by entries.rider_id;
$rider_balances$;

revoke all on function public.get_rider_cash_balances(uuid)
from public, anon, authenticated;
grant execute on function public.get_rider_cash_balances(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Rider delivery action (picked_up | delivered | failed)
-- ---------------------------------------------------------------------------

create or replace function public.rider_delivery_action(
  target_restaurant_id uuid,
  target_assignment_id uuid,
  requested_action text,
  requested_tendered_amount numeric,
  requested_method text,
  requested_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $rider_action$
declare
  assignment_row public.order_rider_assignments%rowtype;
  order_row public.orders%rowtype;
  latest_assignment_id uuid;
  due numeric(10, 2);
  ordered_method text;
  final_method text;
  tendered numeric(10, 2);
  change_due numeric(10, 2) := 0;
  method_was_changed boolean := false;
  clean_reason text;
begin
  if requested_action is null
     or requested_action not in ('picked_up', 'delivered', 'failed') then
    raise exception 'Invalid rider action';
  end if;

  -- Same lock order as order completion: open shift first, then the order.
  perform id from public.restaurant_shifts
  where restaurant_id = target_restaurant_id and status = 'open'
  order by id for update;

  select * into assignment_row
  from public.order_rider_assignments
  where id = target_assignment_id and restaurant_id = target_restaurant_id
  for update;
  if not found then
    raise exception 'Assignment not found';
  end if;

  select * into order_row
  from public.orders
  where id = assignment_row.order_id and restaurant_id = target_restaurant_id
  for update;
  if not found then
    raise exception 'Order not found';
  end if;

  select id into latest_assignment_id
  from public.order_rider_assignments
  where restaurant_id = target_restaurant_id and order_id = assignment_row.order_id
  order by created_at desc, id desc
  limit 1;

  if latest_assignment_id is distinct from assignment_row.id then
    return jsonb_build_object('state', 'replaced', 'changed', false);
  end if;

  if assignment_row.outcome = 'delivered' then
    return jsonb_build_object('state', 'delivered', 'changed', false);
  end if;

  if order_row.fulfilment_type is distinct from 'delivery'
     or order_row.status::text in ('Completed', 'Cancelled') then
    return jsonb_build_object('state', 'ended', 'changed', false);
  end if;

  perform set_config('whatsorder.async_notifications', 'on', true);

  -- ---- picked up ---------------------------------------------------------
  if requested_action = 'picked_up' then
    if order_row.status::text = 'Preparing' then
      perform public.transition_order_status_and_record_event(
        target_restaurant_id, order_row.id, 'Out for Delivery',
        null, 'rider', null
      );
    elsif order_row.status::text <> 'Out for Delivery' then
      raise exception 'The kitchen has not released this order yet';
    end if;

    update public.order_rider_assignments
    set picked_up_at = coalesce(picked_up_at, now()),
        outcome = null,
        outcome_at = null,
        failure_reason = null
    where id = assignment_row.id and restaurant_id = target_restaurant_id;

    return jsonb_build_object('state', 'picked_up', 'changed', true);
  end if;

  -- ---- could not deliver -------------------------------------------------
  if requested_action = 'failed' then
    clean_reason := nullif(left(trim(coalesce(requested_reason, '')), 200), '');
    if clean_reason is null then
      raise exception 'Give a reason the order could not be delivered';
    end if;

    update public.order_rider_assignments
    set outcome = 'failed',
        outcome_at = now(),
        failure_reason = clean_reason
    where id = assignment_row.id and restaurant_id = target_restaurant_id;

    return jsonb_build_object('state', 'failed', 'changed', true);
  end if;

  -- ---- delivered ---------------------------------------------------------
  if order_row.status::text not in ('Preparing', 'Out for Delivery') then
    raise exception 'The kitchen has not released this order yet';
  end if;

  due := coalesce(order_row.total, 0);
  ordered_method := order_row.payment_method::text;

  if order_row.online_payment_status is not null
     and order_row.online_payment_status <> 'paid'
     and ordered_method = 'Online Payment' then
    raise exception 'Online payment is not confirmed yet. Ask the restaurant.';
  end if;

  if ordered_method in ('Cash on Delivery', 'Card on Delivery') and due > 0 then
    final_method := coalesce(nullif(requested_method, ''), ordered_method);
    if final_method not in ('Cash on Delivery', 'Card on Delivery') then
      raise exception 'Invalid payment method';
    end if;

    if final_method = 'Cash on Delivery' then
      tendered := round(coalesce(requested_tendered_amount, 0), 2);
      if tendered < due then
        raise exception 'Cash received is less than the amount due';
      end if;
      if tendered - due > 100000 then
        raise exception 'Cash received is too high';
      end if;
      change_due := tendered - due;
    else
      tendered := due;
    end if;

    if final_method <> ordered_method then
      update public.orders
      set payment_method = final_method::public.payment_method
      where id = order_row.id and restaurant_id = target_restaurant_id;

      insert into public.order_payment_events (
        restaurant_id, order_id, from_method, to_method, actor_user_id, actor_role
      ) values (
        target_restaurant_id, order_row.id, ordered_method, final_method, null, 'rider'
      );
      method_was_changed := true;
    end if;
  else
    -- Online / credit / UPI orders: nothing for the rider to collect.
    final_method := null;
    tendered := null;
  end if;

  if order_row.status::text = 'Preparing' then
    perform public.transition_order_status_and_record_event(
      target_restaurant_id, order_row.id, 'Out for Delivery', null, 'rider', null
    );
  end if;

  perform public.transition_order_status_and_record_event(
    target_restaurant_id, order_row.id, 'Completed', null, 'rider', null
  );

  update public.order_rider_assignments
  set picked_up_at = coalesce(picked_up_at, now()),
      outcome = 'delivered',
      outcome_at = now(),
      failure_reason = null,
      tendered_amount = tendered,
      collected_method = final_method,
      method_changed = method_was_changed
  where id = assignment_row.id and restaurant_id = target_restaurant_id;

  if final_method = 'Cash on Delivery' then
    insert into public.rider_cash_entries (
      restaurant_id, rider_id, entry_type, amount, order_id, assignment_id,
      actor_role
    ) values (
      target_restaurant_id, assignment_row.rider_id, 'order_cash', due,
      order_row.id, assignment_row.id, 'rider'
    );
  end if;

  return jsonb_build_object(
    'state', 'delivered',
    'changed', true,
    'change_due', change_due,
    'collected_method', final_method,
    'due', due
  );
end;
$rider_action$;

revoke all on function public.rider_delivery_action(uuid, uuid, text, numeric, text, text)
from public, anon, authenticated;
grant execute on function public.rider_delivery_action(uuid, uuid, text, numeric, text, text)
to service_role;

-- ---------------------------------------------------------------------------
-- Shift close: v5 refuses while any rider still holds cash, then defers to v4
-- ---------------------------------------------------------------------------

create or replace function public.close_restaurant_shift_v5(
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
as $close_shift_v5$
begin
  if exists (
    select 1
    from public.rider_cash_entries
    where restaurant_id = target_restaurant_id
    group by rider_id
    having sum(amount) <> 0
  ) then
    raise exception 'Settle rider cash before closing the shift';
  end if;

  return public.close_restaurant_shift_v4(
    target_restaurant_id,
    target_shift_id,
    requested_cash_counted_amount,
    requested_card_terminal_total,
    requested_upi_reported_total,
    requested_marketplace_sales,
    requested_closing_note,
    event_actor_user_id,
    requested_cash_denominations
  );
end;
$close_shift_v5$;

revoke all on function public.close_restaurant_shift_v5(
  uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.close_restaurant_shift_v5(
  uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid, jsonb
) to service_role;

-- ---------------------------------------------------------------------------
-- Self-verify: nothing here may be browser-writable or browser-callable.
-- ---------------------------------------------------------------------------

do $rider_cash_self_verify$
begin
  if has_table_privilege('anon', 'public.rider_cash_entries', 'select')
     or has_table_privilege('anon', 'public.rider_cash_entries', 'insert')
     or has_table_privilege('authenticated', 'public.rider_cash_entries', 'insert')
     or has_table_privilege('authenticated', 'public.rider_cash_entries', 'update')
     or has_table_privilege('authenticated', 'public.rider_cash_entries', 'delete')
     or has_table_privilege('service_role', 'public.rider_cash_entries', 'update')
     or has_table_privilege('service_role', 'public.rider_cash_entries', 'delete') then
    raise exception 'rider_cash_entries must be append-only and service-role-written';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.rider_delivery_action(uuid,uuid,text,numeric,text,text)',
       'execute'
     )
     or has_function_privilege(
       'anon',
       'public.rider_delivery_action(uuid,uuid,text,numeric,text,text)',
       'execute'
     ) then
    raise exception 'rider_delivery_action must remain service-role only';
  end if;
end;
$rider_cash_self_verify$;

notify pgrst, 'reload schema';
