-- Allow staff to add items without rewriting already-recorded payments.
-- Unpaid active tickets are amended. Once a payment method is recorded, the
-- addition becomes a separate unpaid kitchen order linked to the original.

alter table public.orders
add column if not exists parent_order_id uuid;

do $parent_order_constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_parent_tenant_fkey'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_parent_tenant_fkey
      foreign key (parent_order_id, restaurant_id)
      references public.orders(id, restaurant_id)
      on delete restrict
      not valid;
  end if;
end;
$parent_order_constraint$;

alter table public.orders
validate constraint orders_parent_tenant_fkey;

create index if not exists idx_orders_parent_order
on public.orders(restaurant_id, parent_order_id, created_at)
where parent_order_id is not null;

create table if not exists public.order_item_addition_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  parent_order_id uuid not null,
  resulting_order_id uuid not null,
  client_order_id uuid not null,
  mode text not null check (mode in ('amended', 'add_on')),
  added_items jsonb not null check (jsonb_typeof(added_items) = 'array'),
  added_subtotal numeric(10, 2) not null check (added_subtotal > 0),
  resulting_total numeric(10, 2) not null check (resulting_total >= 0),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  created_at timestamptz not null default now(),
  constraint order_item_addition_parent_tenant_fkey
    foreign key (parent_order_id, restaurant_id)
    references public.orders(id, restaurant_id)
    on delete restrict,
  constraint order_item_addition_result_tenant_fkey
    foreign key (resulting_order_id, restaurant_id)
    references public.orders(id, restaurant_id)
    on delete restrict,
  constraint order_item_addition_client_unique
    unique (restaurant_id, client_order_id)
);

create index if not exists idx_order_item_additions_parent_created
on public.order_item_addition_events(restaurant_id, parent_order_id, created_at desc);

alter table public.order_item_addition_events enable row level security;

drop policy if exists "Tenant members can read order item additions"
on public.order_item_addition_events;

create policy "Tenant members can read order item additions"
on public.order_item_addition_events
for select
using (
  public.is_restaurant_member(restaurant_id)
  or public.is_super_admin()
);

revoke all on table public.order_item_addition_events from anon, authenticated;
grant select on table public.order_item_addition_events to authenticated;

create or replace function public.add_items_to_restaurant_order(
  target_restaurant_id uuid,
  target_order_id uuid,
  addition_client_order_id uuid,
  addition_items jsonb,
  addition_subtotal numeric,
  addition_note text,
  event_actor_user_id uuid,
  event_actor_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $add_items$
declare
  parent_order public.orders%rowtype;
  resulting_order public.orders%rowtype;
  existing_event public.order_item_addition_events%rowtype;
  active_shift_id uuid;
  addition_mode text;
  rounded_subtotal numeric(10, 2);
  display_note text;
begin
  if target_restaurant_id is null
     or target_order_id is null
     or addition_client_order_id is null then
    raise exception 'Order addition identifiers are required';
  end if;

  if jsonb_typeof(addition_items) <> 'array'
     or jsonb_array_length(addition_items) = 0 then
    raise exception 'Add at least one item';
  end if;

  rounded_subtotal := round(addition_subtotal, 2);
  if rounded_subtotal is null or rounded_subtotal <= 0 then
    raise exception 'Order addition total must be greater than zero';
  end if;

  select *
  into existing_event
  from public.order_item_addition_events
  where restaurant_id = target_restaurant_id
    and client_order_id = addition_client_order_id;

  if found then
    select *
    into resulting_order
    from public.orders
    where id = existing_event.resulting_order_id
      and restaurant_id = target_restaurant_id;

    return jsonb_build_object(
      'mode', existing_event.mode,
      'order', to_jsonb(resulting_order)
    );
  end if;

  select *
  into parent_order
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
  from public.order_item_addition_events
  where restaurant_id = target_restaurant_id
    and client_order_id = addition_client_order_id;

  if found then
    select *
    into resulting_order
    from public.orders
    where id = existing_event.resulting_order_id
      and restaurant_id = target_restaurant_id;

    return jsonb_build_object(
      'mode', existing_event.mode,
      'order', to_jsonb(resulting_order)
    );
  end if;

  if parent_order.status = 'Cancelled' then
    raise exception 'Items cannot be added to a cancelled order';
  end if;

  if parent_order.payment_method is null
     and parent_order.status <> 'Completed' then
    addition_mode := 'amended';

    update public.orders
    set
      items = items || addition_items,
      subtotal = round(subtotal + rounded_subtotal, 2),
      total = round(total + rounded_subtotal, 2),
      updated_at = now()
    where id = target_order_id
      and restaurant_id = target_restaurant_id
    returning * into resulting_order;
  else
    if parent_order.payment_method is null then
      raise exception 'Items cannot be added to a completed unpaid order';
    end if;

    addition_mode := 'add_on';

    select id
    into active_shift_id
    from public.restaurant_shifts
    where restaurant_id = target_restaurant_id
      and status = 'open'
    limit 1;

    display_note := 'ADD-ON to order #' || upper(right(parent_order.id::text, 8));
    if nullif(trim(addition_note), '') is not null then
      display_note := display_note || ' - ' || left(trim(addition_note), 900);
    end if;

    insert into public.orders (
      restaurant_id,
      parent_order_id,
      client_order_id,
      punched_at,
      customer_name,
      customer_phone,
      fulfilment_type,
      car_plate_number,
      car_description,
      table_number,
      delivery_area,
      delivery_address,
      delivery_latitude,
      delivery_longitude,
      delivery_google_maps_url,
      delivery_place_id,
      delivery_address_text,
      delivery_landmark,
      notes,
      payment_method,
      items,
      subtotal,
      delivery_fee,
      total,
      status,
      source,
      shift_id,
      whatsapp_message,
      consent_order_processing,
      consent_marketing,
      consent_timestamp
    )
    values (
      target_restaurant_id,
      parent_order.id,
      addition_client_order_id,
      now(),
      parent_order.customer_name,
      parent_order.customer_phone,
      parent_order.fulfilment_type,
      parent_order.car_plate_number,
      parent_order.car_description,
      parent_order.table_number,
      parent_order.delivery_area,
      parent_order.delivery_address,
      parent_order.delivery_latitude,
      parent_order.delivery_longitude,
      parent_order.delivery_google_maps_url,
      parent_order.delivery_place_id,
      parent_order.delivery_address_text,
      parent_order.delivery_landmark,
      left(display_note, 1000),
      null,
      addition_items,
      rounded_subtotal,
      0,
      rounded_subtotal,
      'Preparing',
      'staff',
      active_shift_id,
      display_note,
      parent_order.consent_order_processing,
      false,
      now()
    )
    returning * into resulting_order;
  end if;

  insert into public.order_item_addition_events (
    restaurant_id,
    parent_order_id,
    resulting_order_id,
    client_order_id,
    mode,
    added_items,
    added_subtotal,
    resulting_total,
    actor_user_id,
    actor_role
  )
  values (
    target_restaurant_id,
    parent_order.id,
    resulting_order.id,
    addition_client_order_id,
    addition_mode,
    addition_items,
    rounded_subtotal,
    resulting_order.total,
    event_actor_user_id,
    left(event_actor_role, 40)
  );

  return jsonb_build_object(
    'mode', addition_mode,
    'order', to_jsonb(resulting_order)
  );
end;
$add_items$;

revoke all on function public.add_items_to_restaurant_order(
  uuid, uuid, uuid, jsonb, numeric, text, uuid, text
) from public, anon, authenticated;

grant execute on function public.add_items_to_restaurant_order(
  uuid, uuid, uuid, jsonb, numeric, text, uuid, text
) to service_role;
