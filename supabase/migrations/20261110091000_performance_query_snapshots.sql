-- Compact service-role snapshots for latency-sensitive staff reads.
-- These functions do not grant browser write/read access: application calls
-- remain authenticated server-side and every input is tenant scoped.

create index if not exists customer_credit_accounts_enabled_updated_idx
on public.customer_credit_accounts(restaurant_id, updated_at desc)
where is_enabled = true;

create or replace function public.get_admin_menu_snapshot(target_restaurant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $admin_menu_snapshot$
  select jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(to_jsonb(category) order by category.display_order, category.created_at)
      from public.menu_categories category
      where category.restaurant_id = target_restaurant_id
        and category.is_active = true
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.created_at)
      from public.menu_items item
      where item.restaurant_id = target_restaurant_id
    ), '[]'::jsonb),
    'offers', coalesce((
      select jsonb_agg(to_jsonb(offer) order by offer.display_order, offer.created_at)
      from public.menu_offers offer
      where offer.restaurant_id = target_restaurant_id
    ), '[]'::jsonb),
    'option_groups', coalesce((
      select jsonb_agg(to_jsonb(option_group) order by option_group.display_order, option_group.created_at)
      from public.menu_option_groups option_group
      where option_group.restaurant_id = target_restaurant_id
    ), '[]'::jsonb),
    'options', coalesce((
      select jsonb_agg(to_jsonb(option_value) order by option_value.display_order, option_value.created_at)
      from public.menu_options option_value
      where option_value.restaurant_id = target_restaurant_id
    ), '[]'::jsonb),
    'option_links', coalesce((
      select jsonb_agg(to_jsonb(option_link) order by option_link.display_order, option_link.created_at)
      from public.menu_item_option_groups option_link
      where option_link.restaurant_id = target_restaurant_id
    ), '[]'::jsonb)
  );
$admin_menu_snapshot$;

create or replace function public.get_restaurant_admin_session_snapshot(
  target_user_id uuid,
  selected_restaurant_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $restaurant_admin_session_snapshot$
  with memberships as materialized (
    select membership.restaurant_id, membership.role, membership.email
    from public.restaurant_users membership
    where membership.user_id = target_user_id
      and membership.accepted_at is not null
      and membership.role in ('restaurant_admin', 'staff', 'owner', 'manager')
  ), membership_count as (
    select count(*)::integer as value from memberships
  ), selected_membership as (
    select
      membership.restaurant_id,
      membership.role,
      membership.email,
      to_jsonb(restaurant) as restaurant
    from memberships membership
    cross join membership_count count
    left join public.restaurants restaurant on restaurant.id = membership.restaurant_id
    where count.value = 1
      or membership.restaurant_id = selected_restaurant_id
    order by membership.restaurant_id
    limit 1
  )
  select jsonb_build_object(
    'membership_count', membership_count.value,
    'membership', case when selected_membership.restaurant_id is null then null
      else jsonb_build_object(
        'restaurant_id', selected_membership.restaurant_id,
        'role', selected_membership.role,
        'email', selected_membership.email
      ) end,
    'restaurant', selected_membership.restaurant
  )
  from membership_count
  left join selected_membership on true;
$restaurant_admin_session_snapshot$;

create or replace function public.get_tenant_access_snapshot(target_restaurant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $tenant_access_snapshot$
  select jsonb_build_object(
    'subscription', to_jsonb(subscription),
    'plan', to_jsonb(plan)
  )
  from public.subscriptions subscription
  left join public.plans plan on plan.id = subscription.plan_id
  where subscription.restaurant_id = target_restaurant_id
  limit 1;
$tenant_access_snapshot$;

create or replace function public.get_customer_credit_snapshots(
  target_restaurant_id uuid,
  requested_customer_ids uuid[],
  requested_customer_phones text[],
  requested_enabled_only boolean,
  requested_limit integer
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $customer_credit_snapshots$
  with local_day as (
    select (now() at time zone coalesce(restaurant.time_zone, 'Asia/Dubai'))::date as today
    from public.restaurants restaurant
    where restaurant.id = target_restaurant_id
  ), selected_accounts as materialized (
    select
      account.id as account_id,
      account.restaurant_id,
      account.customer_id,
      account.is_enabled,
      account.credit_limit,
      account.terms_days,
      account.reminders_enabled,
      account.created_at,
      account.updated_at,
      customer.name as customer_name,
      customer.phone as customer_phone
    from public.customer_credit_accounts account
    join public.customers customer
      on customer.id = account.customer_id
      and customer.restaurant_id = account.restaurant_id
    where account.restaurant_id = target_restaurant_id
      and (not coalesce(requested_enabled_only, false) or account.is_enabled)
      and (
        (
          coalesce(cardinality(requested_customer_ids), 0) = 0
          and coalesce(cardinality(requested_customer_phones), 0) = 0
        )
        or customer.id = any(coalesce(requested_customer_ids, '{}'::uuid[]))
        or customer.phone = any(coalesce(requested_customer_phones, '{}'::text[]))
      )
    order by account.updated_at desc, customer.name, customer.id
    limit least(greatest(coalesce(requested_limit, 250), 1), 500)
  ), entry_totals as (
    select
      account.account_id,
      greatest(coalesce(sum(entry.amount), 0), 0)::numeric(12, 2) as balance,
      coalesce(sum(abs(entry.amount)) filter (where entry.amount < 0), 0)::numeric(12, 2)
        as available_credits
    from selected_accounts account
    left join public.customer_credit_entries entry
      on entry.restaurant_id = account.restaurant_id
      and entry.account_id = account.account_id
    group by account.account_id
  ), positive_running as (
    select
      entry.account_id,
      entry.due_date,
      entry.amount,
      coalesce(sum(entry.amount) over (
        partition by entry.account_id
        order by coalesce(entry.due_date, entry.created_at::date), entry.created_at, entry.id
        rows between unbounded preceding and 1 preceding
      ), 0) as prior_positive
    from public.customer_credit_entries entry
    join selected_accounts account
      on account.account_id = entry.account_id
      and account.restaurant_id = entry.restaurant_id
    where entry.amount > 0
  ), positive_outstanding as (
    select
      running.account_id,
      running.due_date,
      greatest(
        running.amount - least(
          running.amount,
          greatest(totals.available_credits - running.prior_positive, 0)
        ),
        0
      )::numeric(12, 2) as outstanding
    from positive_running running
    join entry_totals totals on totals.account_id = running.account_id
  ), outstanding_metrics as (
    select
      outstanding.account_id,
      coalesce(sum(outstanding.outstanding) filter (
        where outstanding.due_date < local_day.today
      ), 0)::numeric(12, 2) as overdue,
      min(outstanding.due_date) filter (
        where outstanding.outstanding > 0 and outstanding.due_date is not null
      ) as oldest_outstanding_due_date
    from positive_outstanding outstanding
    cross join local_day
    group by outstanding.account_id
  ), snapshot_rows as (
    select
      account.*,
      totals.balance,
      least(totals.balance, coalesce(metrics.overdue, 0))::numeric(12, 2) as overdue,
      greatest(account.credit_limit - totals.balance, 0)::numeric(12, 2) as available,
      metrics.oldest_outstanding_due_date,
      reminder.last_reminder
    from selected_accounts account
    join entry_totals totals on totals.account_id = account.account_id
    left join outstanding_metrics metrics on metrics.account_id = account.account_id
    left join lateral (
      select to_jsonb(latest_reminder) as last_reminder
      from public.customer_credit_reminders latest_reminder
      where latest_reminder.restaurant_id = account.restaurant_id
        and latest_reminder.account_id = account.account_id
      order by latest_reminder.created_at desc, latest_reminder.id desc
      limit 1
    ) reminder on true
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'customer_id', snapshot.customer_id,
    'customer_name', snapshot.customer_name,
    'customer_phone', snapshot.customer_phone,
    'account', jsonb_build_object(
      'id', snapshot.account_id,
      'restaurant_id', snapshot.restaurant_id,
      'customer_id', snapshot.customer_id,
      'is_enabled', snapshot.is_enabled,
      'credit_limit', snapshot.credit_limit,
      'terms_days', snapshot.terms_days,
      'reminders_enabled', snapshot.reminders_enabled,
      'created_at', snapshot.created_at,
      'updated_at', snapshot.updated_at
    ),
    'balance', snapshot.balance,
    'overdue', snapshot.overdue,
    'available', snapshot.available,
    'oldest_outstanding_due_date', snapshot.oldest_outstanding_due_date,
    'last_reminder', snapshot.last_reminder
  ) order by snapshot.customer_name, snapshot.customer_id), '[]'::jsonb)
  from snapshot_rows snapshot;
$customer_credit_snapshots$;

-- Preserve the proven v4 transaction and return the idempotently persisted
-- message with the order id, removing a second PostgREST read from checkout.
create or replace function public.create_order_with_customer_v5(
  target_restaurant_id uuid,
  order_customer_name text,
  order_customer_phone text,
  order_fulfilment_type text,
  order_car_plate_number text,
  order_car_description text,
  order_table_number text,
  order_delivery_area text,
  order_delivery_address text,
  order_delivery_latitude numeric,
  order_delivery_longitude numeric,
  order_delivery_google_maps_url text,
  order_delivery_place_id text,
  order_delivery_address_text text,
  order_delivery_landmark text,
  order_notes text,
  order_payment_method text,
  order_items jsonb,
  order_subtotal numeric,
  order_delivery_fee numeric,
  order_total numeric,
  order_whatsapp_message text,
  order_consent_processing boolean,
  order_consent_marketing boolean,
  order_consent_timestamp timestamptz,
  order_submission_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $create_order_v5$
declare
  saved_order_id uuid;
  saved_whatsapp_message text;
begin
  saved_order_id := public.create_order_with_customer_v4(
    target_restaurant_id,
    order_customer_name,
    order_customer_phone,
    order_fulfilment_type,
    order_car_plate_number,
    order_car_description,
    order_table_number,
    order_delivery_area,
    order_delivery_address,
    order_delivery_latitude,
    order_delivery_longitude,
    order_delivery_google_maps_url,
    order_delivery_place_id,
    order_delivery_address_text,
    order_delivery_landmark,
    order_notes,
    order_payment_method,
    order_items,
    order_subtotal,
    order_delivery_fee,
    order_total,
    order_whatsapp_message,
    order_consent_processing,
    order_consent_marketing,
    order_consent_timestamp,
    order_submission_token
  );

  select orders.whatsapp_message
  into saved_whatsapp_message
  from public.orders
  where orders.id = saved_order_id
    and orders.restaurant_id = target_restaurant_id;

  return jsonb_build_object(
    'order_id', saved_order_id,
    'whatsapp_message', saved_whatsapp_message
  );
end;
$create_order_v5$;

revoke all on function public.get_admin_menu_snapshot(uuid)
from public, anon, authenticated;
revoke all on function public.get_restaurant_admin_session_snapshot(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.get_tenant_access_snapshot(uuid)
from public, anon, authenticated;
revoke all on function public.get_customer_credit_snapshots(
  uuid, uuid[], text[], boolean, integer
) from public, anon, authenticated;
revoke all on function public.create_order_with_customer_v5(
  uuid, text, text, text, text, text, text, text, text, numeric, numeric, text,
  text, text, text, text, text, jsonb, numeric, numeric, numeric, text, boolean,
  boolean, timestamptz, text
) from public, anon, authenticated;

grant execute on function public.get_admin_menu_snapshot(uuid) to service_role;
grant execute on function public.get_restaurant_admin_session_snapshot(uuid, uuid)
to service_role;
grant execute on function public.get_tenant_access_snapshot(uuid) to service_role;
grant execute on function public.get_customer_credit_snapshots(
  uuid, uuid[], text[], boolean, integer
) to service_role;
grant execute on function public.create_order_with_customer_v5(
  uuid, text, text, text, text, text, text, text, text, numeric, numeric, text,
  text, text, text, text, text, jsonb, numeric, numeric, numeric, text, boolean,
  boolean, timestamptz, text
) to service_role;

do $verify_performance_snapshots$
begin
  if has_function_privilege(
    'authenticated',
    'public.get_admin_menu_snapshot(uuid)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.get_restaurant_admin_session_snapshot(uuid,uuid)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.get_tenant_access_snapshot(uuid)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.get_customer_credit_snapshots(uuid,uuid[],text[],boolean,integer)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.create_order_with_customer_v5(uuid,text,text,text,text,text,text,text,text,numeric,numeric,text,text,text,text,text,text,jsonb,numeric,numeric,numeric,text,boolean,boolean,timestamptz,text)',
    'execute'
  ) then
    raise exception 'Performance snapshots must remain service-role-only';
  end if;
end;
$verify_performance_snapshots$;

notify pgrst, 'reload schema';
