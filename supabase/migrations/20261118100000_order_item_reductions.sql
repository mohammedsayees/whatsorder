-- Let staff reduce quantities on an active, unpaid staff-punched KOT.
-- Reductions are tenant-scoped, idempotent and audited. Paid orders are
-- intentionally excluded because changing them requires a refund/ledger flow.

create table if not exists public.order_item_reduction_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null,
  client_order_id uuid not null,
  before_items jsonb not null check (jsonb_typeof(before_items) = 'array'),
  removed_items jsonb not null check (
    jsonb_typeof(removed_items) = 'array' and jsonb_array_length(removed_items) > 0
  ),
  resulting_items jsonb not null check (
    jsonb_typeof(resulting_items) = 'array' and jsonb_array_length(resulting_items) > 0
  ),
  removed_subtotal numeric(10, 2) not null check (removed_subtotal >= 0),
  resulting_subtotal numeric(10, 2) not null check (resulting_subtotal >= 0),
  resulting_total numeric(10, 2) not null check (resulting_total >= 0),
  reason text not null check (char_length(trim(reason)) between 1 and 300),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  created_at timestamptz not null default now(),
  constraint order_item_reduction_order_tenant_fkey
    foreign key (order_id, restaurant_id)
    references public.orders(id, restaurant_id)
    on delete restrict,
  constraint order_item_reduction_client_unique
    unique (restaurant_id, client_order_id)
);

create index if not exists idx_order_item_reductions_order_created
on public.order_item_reduction_events(restaurant_id, order_id, created_at desc);

alter table public.order_item_reduction_events enable row level security;

drop policy if exists "Tenant members can read order item reductions"
on public.order_item_reduction_events;

create policy "Tenant members can read order item reductions"
on public.order_item_reduction_events
for select
using (
  public.is_restaurant_member(restaurant_id)
  or public.is_super_admin()
);

revoke all on table public.order_item_reduction_events from anon, authenticated;
grant select on table public.order_item_reduction_events to authenticated;

create or replace function public.reduce_restaurant_order_items(
  target_restaurant_id uuid,
  target_order_id uuid,
  reduction_client_order_id uuid,
  expected_items jsonb,
  requested_reductions jsonb,
  reduction_reason text,
  event_actor_user_id uuid,
  event_actor_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $reduce_items$
declare
  saved_order public.orders%rowtype;
  existing_event public.order_item_reduction_events%rowtype;
  working_items jsonb;
  removed_items jsonb := '[]'::jsonb;
  reduction jsonb;
  current_item jsonb;
  line_index integer;
  remove_quantity integer;
  current_quantity integer;
  remaining_quantity integer;
  unit_price numeric;
  removed_subtotal numeric(10, 2) := 0;
  resulting_subtotal numeric(10, 2);
  resulting_total numeric(10, 2);
begin
  if target_restaurant_id is null
     or target_order_id is null
     or reduction_client_order_id is null then
    raise exception 'Order reduction identifiers are required';
  end if;

  if nullif(trim(reduction_reason), '') is null then
    raise exception 'A reason is required';
  end if;

  if jsonb_typeof(expected_items) <> 'array'
     or jsonb_typeof(requested_reductions) <> 'array'
     or jsonb_array_length(requested_reductions) = 0 then
    raise exception 'Choose at least one item to remove';
  end if;

  select *
  into existing_event
  from public.order_item_reduction_events
  where restaurant_id = target_restaurant_id
    and client_order_id = reduction_client_order_id;

  if found then
    if existing_event.order_id <> target_order_id then
      raise exception 'This reduction attempt belongs to another order';
    end if;

    select * into saved_order
    from public.orders
    where id = existing_event.order_id
      and restaurant_id = target_restaurant_id;

    return jsonb_build_object(
      'order', to_jsonb(saved_order),
      'removed_items', existing_event.removed_items,
      'reason', existing_event.reason
    );
  end if;

  select *
  into saved_order
  from public.orders
  where id = target_order_id
    and restaurant_id = target_restaurant_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  -- A duplicate request may have waited for the first request's row lock.
  select *
  into existing_event
  from public.order_item_reduction_events
  where restaurant_id = target_restaurant_id
    and client_order_id = reduction_client_order_id;

  if found then
    if existing_event.order_id <> target_order_id then
      raise exception 'This reduction attempt belongs to another order';
    end if;

    return jsonb_build_object(
      'order', to_jsonb(saved_order),
      'removed_items', existing_event.removed_items,
      'reason', existing_event.reason
    );
  end if;

  if saved_order.source <> 'staff' then
    raise exception 'Only staff-punched orders can be changed here';
  end if;

  if saved_order.payment_method is not null then
    raise exception 'Paid orders require a refund and cannot be reduced';
  end if;

  if saved_order.status in ('Completed', 'Cancelled') then
    raise exception 'Completed or cancelled orders cannot be reduced';
  end if;

  if coalesce(saved_order.loyalty_discount, 0) <> 0
     or coalesce(saved_order.points_redeemed, 0) <> 0
     or coalesce(saved_order.points_earned, 0) <> 0 then
    raise exception 'Orders with loyalty activity cannot be reduced here';
  end if;

  if saved_order.items is distinct from expected_items then
    raise exception 'The order items changed. Refresh before removing items';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(requested_reductions) entry
    where jsonb_typeof(entry) <> 'object'
       or coalesce(entry->>'line_index', '') !~ '^[0-9]+$'
       or coalesce(entry->>'quantity', '') !~ '^[1-9][0-9]*$'
  ) then
    raise exception 'Invalid item reduction';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(requested_reductions)
  ) <> (
    select count(distinct (entry->>'line_index')::integer)
    from jsonb_array_elements(requested_reductions) entry
  ) then
    raise exception 'Each order line can be reduced only once';
  end if;

  working_items := saved_order.items;

  -- Descending indexes allow complete lines to be deleted without shifting
  -- any lower line indexes that still need processing.
  for reduction in
    select entry
    from jsonb_array_elements(requested_reductions) entry
    order by (entry->>'line_index')::integer desc
  loop
    line_index := (reduction->>'line_index')::integer;
    remove_quantity := (reduction->>'quantity')::integer;
    current_item := working_items->line_index;

    if current_item is null then
      raise exception 'An item no longer exists on this order';
    end if;

    if coalesce(current_item->>'quantity', '') !~ '^[1-9][0-9]*$' then
      raise exception 'An order item has an invalid quantity';
    end if;

    current_quantity := (current_item->>'quantity')::integer;
    if remove_quantity > current_quantity then
      raise exception 'Cannot remove more than the ordered quantity';
    end if;

    begin
      unit_price := (current_item->>'price')::numeric;
    exception when others then
      raise exception 'An order item has an invalid price';
    end;

    if unit_price < 0 then
      raise exception 'An order item has an invalid price';
    end if;

    removed_subtotal := round(removed_subtotal + unit_price * remove_quantity, 2);
    removed_items := jsonb_build_array(
      jsonb_set(current_item, '{quantity}', to_jsonb(remove_quantity), false)
    ) || removed_items;

    remaining_quantity := current_quantity - remove_quantity;
    if remaining_quantity = 0 then
      working_items := working_items - line_index;
    else
      working_items := jsonb_set(
        working_items,
        array[line_index::text, 'quantity'],
        to_jsonb(remaining_quantity),
        false
      );
    end if;
  end loop;

  if jsonb_array_length(working_items) = 0 then
    raise exception 'Cancel the order instead of removing every item';
  end if;

  resulting_subtotal := round(saved_order.subtotal - removed_subtotal, 2);
  resulting_total := round(saved_order.total - removed_subtotal, 2);

  if resulting_subtotal < 0 or resulting_total < 0 then
    raise exception 'The order totals could not be reduced safely';
  end if;

  update public.orders
  set items = working_items,
      subtotal = resulting_subtotal,
      total = resulting_total,
      updated_at = now()
  where id = target_order_id
    and restaurant_id = target_restaurant_id
  returning * into saved_order;

  insert into public.order_item_reduction_events (
    restaurant_id,
    order_id,
    client_order_id,
    before_items,
    removed_items,
    resulting_items,
    removed_subtotal,
    resulting_subtotal,
    resulting_total,
    reason,
    actor_user_id,
    actor_role
  ) values (
    target_restaurant_id,
    target_order_id,
    reduction_client_order_id,
    expected_items,
    removed_items,
    working_items,
    removed_subtotal,
    resulting_subtotal,
    resulting_total,
    left(trim(reduction_reason), 300),
    event_actor_user_id,
    left(event_actor_role, 40)
  );

  return jsonb_build_object(
    'order', to_jsonb(saved_order),
    'removed_items', removed_items,
    'reason', left(trim(reduction_reason), 300)
  );
end;
$reduce_items$;

revoke all on function public.reduce_restaurant_order_items(
  uuid, uuid, uuid, jsonb, jsonb, text, uuid, text
) from public, anon, authenticated;

grant execute on function public.reduce_restaurant_order_items(
  uuid, uuid, uuid, jsonb, jsonb, text, uuid, text
) to service_role;
