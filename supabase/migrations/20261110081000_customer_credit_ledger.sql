-- Tenant-scoped customer credit accounts, immutable ledger entries and
-- auditable WhatsApp reminder outcomes. Application writes use only the
-- service-role client; authenticated users retain management-scoped reads.

create table public.customer_credit_accounts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null,
  is_enabled boolean not null default true,
  credit_limit numeric(12, 2) not null default 0 check (credit_limit >= 0),
  terms_days integer not null default 7 check (terms_days between 0 and 365),
  reminders_enabled boolean not null default true,
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_credit_accounts_id_restaurant_unique
    unique (id, restaurant_id),
  constraint customer_credit_accounts_customer_unique
    unique (restaurant_id, customer_id),
  constraint customer_credit_accounts_customer_tenant_fk
    foreign key (customer_id, restaurant_id)
    references public.customers(id, restaurant_id) on delete restrict
);

create table public.customer_credit_entries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  account_id uuid not null,
  order_id uuid,
  entry_type text not null check (
    entry_type in ('charge', 'payment', 'adjustment', 'write_off', 'reversal')
  ),
  -- Positive amounts increase debt; negative amounts reduce debt.
  amount numeric(12, 2) not null check (amount <> 0),
  due_date date,
  payment_method text check (
    payment_method is null
    or payment_method in ('cash', 'card', 'upi', 'bank_transfer', 'other')
  ),
  note text check (note is null or char_length(trim(note)) between 1 and 300),
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint customer_credit_entries_id_restaurant_unique
    unique (id, restaurant_id),
  constraint customer_credit_entries_account_tenant_fk
    foreign key (account_id, restaurant_id)
    references public.customer_credit_accounts(id, restaurant_id) on delete restrict,
  constraint customer_credit_entries_order_tenant_fk
    foreign key (order_id, restaurant_id)
    references public.orders(id, restaurant_id) on delete restrict,
  constraint customer_credit_entry_shape check (
    (entry_type = 'charge' and amount > 0 and order_id is not null
      and due_date is not null and payment_method is null)
    or (entry_type = 'payment' and amount < 0 and payment_method is not null)
    or (entry_type = 'write_off' and amount < 0 and payment_method is null)
    or (entry_type in ('adjustment', 'reversal') and payment_method is null)
  )
);

create unique index customer_credit_charge_order_unique
on public.customer_credit_entries(restaurant_id, order_id)
where entry_type = 'charge' and order_id is not null;

create index customer_credit_entries_account_created
on public.customer_credit_entries(restaurant_id, account_id, created_at desc, id desc);

create index customer_credit_entries_due
on public.customer_credit_entries(restaurant_id, account_id, due_date)
where amount > 0 and due_date is not null;

create table public.customer_credit_reminders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  account_id uuid not null,
  reminder_on date not null,
  reminder_kind text not null check (
    reminder_kind in ('due_tomorrow', 'due_today', 'overdue_3', 'overdue_7', 'overdue_weekly', 'manual')
  ),
  is_manual boolean not null default false,
  balance_snapshot numeric(12, 2) not null check (balance_snapshot >= 0),
  overdue_snapshot numeric(12, 2) not null check (overdue_snapshot >= 0),
  delivery_status text not null default 'sending' check (
    delivery_status in ('sending', 'accepted', 'skipped', 'failed')
  ),
  delivery_reason text,
  transport_message_id text,
  sent_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint customer_credit_reminders_account_tenant_fk
    foreign key (account_id, restaurant_id)
    references public.customer_credit_accounts(id, restaurant_id) on delete restrict
);

create unique index customer_credit_automatic_reminder_unique
on public.customer_credit_reminders(
  restaurant_id, account_id, reminder_on, reminder_kind
)
where is_manual = false;

create index customer_credit_reminders_account_created
on public.customer_credit_reminders(restaurant_id, account_id, created_at desc);

-- Credit repayments are operational receipts, not new sales. Reuse the shift
-- receipt reconciliation table with a system-only category so cash/card/UPI
-- totals remain correct without counting the repayment as another order sale.
alter table public.shift_other_income_entries
  drop constraint if exists shift_other_income_entries_category_check;
alter table public.shift_other_income_entries
  add constraint shift_other_income_entries_category_check check (
    category in (
      'used_oil_sale', 'scrap_sale', 'supplier_rebate', 'rental_income',
      'customer_credit_repayment', 'other'
    )
  );
alter table public.shift_other_income_entries
  add column customer_credit_entry_id uuid;
alter table public.shift_other_income_entries
  add constraint shift_other_income_credit_entry_tenant_fk
  foreign key (customer_credit_entry_id, restaurant_id)
  references public.customer_credit_entries(id, restaurant_id) on delete restrict;
create unique index shift_other_income_credit_entry_unique
on public.shift_other_income_entries(restaurant_id, customer_credit_entry_id)
where customer_credit_entry_id is not null;

-- The shift receipt is the reconciliation counterpart of an immutable ledger
-- payment. It must not be voided independently and leave the drawer totals out
-- of sync with the customer's balance.
create or replace function public.protect_customer_credit_shift_receipt()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.customer_credit_entry_id is not null then
    raise exception 'Customer credit receipts must be corrected from the credit ledger';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.protect_customer_credit_shift_receipt()
from public, anon, authenticated;
create trigger shift_other_income_protect_credit_receipt
before update or delete on public.shift_other_income_entries
for each row execute function public.protect_customer_credit_shift_receipt();

create or replace function public.set_customer_credit_account_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.set_customer_credit_account_updated_at()
from public, anon, authenticated;
create trigger customer_credit_accounts_set_updated_at
before update on public.customer_credit_accounts
for each row execute function public.set_customer_credit_account_updated_at();

-- Ledger facts are append-only. Corrections are explicit reversal/adjustment
-- rows, which preserves who changed the balance and when.
create or replace function public.protect_customer_credit_entry()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Customer credit ledger entries are immutable';
end;
$$;
revoke all on function public.protect_customer_credit_entry()
from public, anon, authenticated;
create trigger customer_credit_entries_immutable
before update or delete on public.customer_credit_entries
for each row execute function public.protect_customer_credit_entry();

-- A Customer Credit payment method may only be introduced or removed by the
-- dedicated atomic ledger RPC below. This prevents an order/ledger mismatch
-- through any older service-role code path.
create or replace function public.protect_customer_credit_payment_method()
returns trigger language plpgsql set search_path = '' as $$
declare allowed text := current_setting('whatsorder.customer_credit_write', true);
begin
  if tg_op = 'INSERT' then
    if new.payment_method::text = 'Customer Credit' and allowed is distinct from 'on' then
      raise exception 'Customer Credit requires the credit ledger';
    end if;
  elsif new.payment_method is distinct from old.payment_method
    and (new.payment_method::text = 'Customer Credit'
      or old.payment_method::text = 'Customer Credit')
    and allowed is distinct from 'on' then
    raise exception 'Customer Credit must be corrected from the credit ledger';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_customer_credit_payment_method()
from public, anon, authenticated;
create trigger orders_protect_customer_credit_payment_method
before insert or update of payment_method on public.orders
for each row execute function public.protect_customer_credit_payment_method();

create or replace function public.configure_customer_credit_account(
  target_restaurant_id uuid,
  target_customer_id uuid,
  requested_enabled boolean,
  requested_credit_limit numeric,
  requested_terms_days integer,
  requested_reminders_enabled boolean,
  requested_opening_balance numeric,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $configure_credit$
declare
  actor_role text;
  saved_account_id uuid;
  local_today date;
begin
  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);
  if actor_role is null or actor_role not in ('restaurant_admin', 'owner', 'manager') then
    raise exception 'Only restaurant management can configure customer credit';
  end if;
  if requested_enabled is null or requested_reminders_enabled is null
    or requested_credit_limit < 0 or requested_credit_limit > 1000000
    or requested_terms_days not between 0 and 365
    or coalesce(requested_opening_balance, 0) < 0
    or coalesce(requested_opening_balance, 0) > requested_credit_limit then
    raise exception 'Invalid customer credit settings';
  end if;

  perform id from public.customers
  where id = target_customer_id and restaurant_id = target_restaurant_id
  for update;
  if not found then raise exception 'Customer not found'; end if;

  insert into public.customer_credit_accounts (
    restaurant_id, customer_id, is_enabled, credit_limit, terms_days,
    reminders_enabled, created_by_user_id, updated_by_user_id
  ) values (
    target_restaurant_id, target_customer_id, requested_enabled,
    round(requested_credit_limit, 2), requested_terms_days,
    requested_reminders_enabled, event_actor_user_id, event_actor_user_id
  )
  on conflict (restaurant_id, customer_id) do update set
    is_enabled = excluded.is_enabled,
    credit_limit = excluded.credit_limit,
    terms_days = excluded.terms_days,
    reminders_enabled = excluded.reminders_enabled,
    updated_by_user_id = excluded.updated_by_user_id
  returning id into saved_account_id;

  if coalesce(requested_opening_balance, 0) > 0 then
    if exists (
      select 1 from public.customer_credit_entries
      where restaurant_id = target_restaurant_id and account_id = saved_account_id
    ) then
      raise exception 'Opening balance can only be recorded on a new empty account';
    end if;
    select (now() at time zone coalesce(time_zone, 'Asia/Dubai'))::date
    into local_today from public.restaurants where id = target_restaurant_id;
    insert into public.customer_credit_entries (
      restaurant_id, account_id, entry_type, amount, due_date, note, actor_user_id
    ) values (
      target_restaurant_id, saved_account_id, 'adjustment',
      round(requested_opening_balance, 2), local_today + requested_terms_days,
      'Opening credit balance', event_actor_user_id
    );
  end if;

  return saved_account_id;
end;
$configure_credit$;

-- Management can open a credit account before the customer's first online
-- order. The phone remains tenant-local; this does not grant marketing consent.
create or replace function public.create_credit_customer_account(
  target_restaurant_id uuid,
  requested_name text,
  requested_phone text,
  requested_credit_limit numeric,
  requested_terms_days integer,
  requested_reminders_enabled boolean,
  requested_opening_balance numeric,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $create_credit_customer$
declare
  actor_role text;
  saved_customer_id uuid;
begin
  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);
  if actor_role is null or actor_role not in ('restaurant_admin', 'owner', 'manager') then
    raise exception 'Only restaurant management can add credit customers';
  end if;
  if nullif(trim(requested_name), '') is null
    or char_length(trim(requested_name)) > 120
    or nullif(trim(requested_phone), '') is null
    or char_length(trim(requested_phone)) > 24 then
    raise exception 'A valid customer name and phone are required';
  end if;

  insert into public.customers (
    restaurant_id, name, phone, delivery_area, delivery_address,
    marketing_opt_in, consent_order_processing, consent_marketing,
    consent_timestamp
  ) values (
    target_restaurant_id, trim(requested_name), trim(requested_phone), '', '',
    false, true, false, now()
  )
  on conflict (restaurant_id, phone) do update set
    name = excluded.name,
    consent_order_processing = true,
    consent_timestamp = coalesce(public.customers.consent_timestamp, now()),
    updated_at = now()
  returning id into saved_customer_id;

  perform public.configure_customer_credit_account(
    target_restaurant_id, saved_customer_id, true, requested_credit_limit,
    requested_terms_days, requested_reminders_enabled,
    requested_opening_balance, event_actor_user_id
  );
  return saved_customer_id;
end;
$create_credit_customer$;

create or replace function public.record_customer_credit_order(
  target_restaurant_id uuid,
  target_order_id uuid,
  event_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $credit_order$
declare
  actor_role text;
  order_preview public.orders%rowtype;
  saved_order public.orders%rowtype;
  saved_account public.customer_credit_accounts%rowtype;
  saved_customer public.customers%rowtype;
  current_balance numeric(12, 2);
  local_today date;
  saved_shift_status text;
begin
  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);
  if actor_role is null then raise exception 'Restaurant membership required'; end if;

  select * into order_preview from public.orders
  where id = target_order_id and restaurant_id = target_restaurant_id;
  if not found then raise exception 'Order not found'; end if;

  perform id from public.restaurant_shifts
  where restaurant_id = target_restaurant_id
    and (status = 'open' or id = order_preview.shift_id)
  order by id for update;

  select * into saved_order from public.orders
  where id = target_order_id and restaurant_id = target_restaurant_id
  for update;

  if saved_order.shift_id is not null then
    select status into saved_shift_status from public.restaurant_shifts
    where id = saved_order.shift_id and restaurant_id = target_restaurant_id;
  end if;
  if saved_shift_status = 'closed' then
    raise exception 'Cannot collect payment in a closed shift';
  end if;

  select customer.* into saved_customer
  from public.customers customer
  where customer.restaurant_id = target_restaurant_id
    and customer.phone = saved_order.customer_phone
  for update;
  if not found then raise exception 'Customer profile not found'; end if;

  select account.* into saved_account
  from public.customer_credit_accounts account
  where account.restaurant_id = target_restaurant_id
    and account.customer_id = saved_customer.id
  for update;
  if not found or saved_account.is_enabled is false then
    raise exception 'Customer credit is not enabled';
  end if;

  if saved_order.status = 'Completed'
    and saved_order.payment_method::text = 'Customer Credit'
    and exists (
      select 1 from public.customer_credit_entries
      where restaurant_id = target_restaurant_id and order_id = target_order_id
        and entry_type = 'charge'
    ) then
    return jsonb_build_object('order_id', saved_order.id, 'changed', false);
  end if;
  if saved_order.payment_method is not null then
    raise exception 'A different payment method is already recorded';
  end if;

  select coalesce(sum(amount), 0) into current_balance
  from public.customer_credit_entries
  where restaurant_id = target_restaurant_id and account_id = saved_account.id;
  current_balance := greatest(current_balance, 0);
  if current_balance + saved_order.total > saved_account.credit_limit then
    raise exception 'Customer credit limit exceeded';
  end if;

  select (now() at time zone coalesce(time_zone, 'Asia/Dubai'))::date
  into local_today from public.restaurants where id = target_restaurant_id;

  perform set_config('whatsorder.customer_credit_write', 'on', true);
  perform set_config('whatsorder.async_notifications', 'on', true);
  update public.orders set payment_method = 'Customer Credit'::public.payment_method
  where id = target_order_id and restaurant_id = target_restaurant_id;

  insert into public.order_payment_events (
    restaurant_id, order_id, from_method, to_method, actor_user_id, actor_role
  ) values (
    target_restaurant_id, target_order_id, null, 'Customer Credit',
    event_actor_user_id, actor_role
  );

  insert into public.customer_credit_entries (
    restaurant_id, account_id, order_id, entry_type, amount, due_date,
    note, actor_user_id
  ) values (
    target_restaurant_id, saved_account.id, target_order_id, 'charge',
    saved_order.total, local_today + saved_account.terms_days,
    'Order #' || upper(right(saved_order.id::text, 8)), event_actor_user_id
  );

  perform public.transition_order_status_and_record_event(
    target_restaurant_id, target_order_id, 'Completed',
    event_actor_user_id, actor_role, null
  );
  return jsonb_build_object('order_id', target_order_id, 'changed', true);
end;
$credit_order$;

create or replace function public.record_customer_credit_payment(
  target_restaurant_id uuid,
  target_customer_id uuid,
  requested_amount numeric,
  requested_payment_method text,
  requested_note text,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $credit_payment$
declare
  actor_role text;
  saved_account public.customer_credit_accounts%rowtype;
  saved_customer public.customers%rowtype;
  open_shift_id uuid;
  current_balance numeric(12, 2);
  created_entry_id uuid;
  restaurant_country text;
begin
  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);
  if actor_role is null or actor_role not in ('restaurant_admin', 'owner', 'manager') then
    raise exception 'Only restaurant management can record credit payments';
  end if;
  if requested_amount is null or requested_amount <= 0 or requested_amount > 1000000
    or requested_payment_method not in ('cash', 'card', 'upi', 'bank_transfer', 'other')
    or char_length(coalesce(trim(requested_note), '')) > 300 then
    raise exception 'Invalid customer credit payment';
  end if;
  select country_code into restaurant_country from public.restaurants
  where id = target_restaurant_id;
  if requested_payment_method = 'upi' and restaurant_country is distinct from 'IN' then
    raise exception 'UPI is not available for this restaurant';
  end if;

  select customer.* into saved_customer from public.customers customer
  where customer.id = target_customer_id and customer.restaurant_id = target_restaurant_id
  for update;
  if not found then raise exception 'Customer not found'; end if;
  select account.* into saved_account from public.customer_credit_accounts account
  where account.customer_id = target_customer_id
    and account.restaurant_id = target_restaurant_id
  for update;
  if not found then raise exception 'Customer credit account not found'; end if;

  select coalesce(sum(amount), 0) into current_balance
  from public.customer_credit_entries
  where restaurant_id = target_restaurant_id and account_id = saved_account.id;
  current_balance := greatest(current_balance, 0);
  if round(requested_amount, 2) > current_balance then
    raise exception 'Payment exceeds the outstanding balance';
  end if;

  select id into open_shift_id from public.restaurant_shifts
  where restaurant_id = target_restaurant_id and status = 'open'
  for update;
  if open_shift_id is null then
    raise exception 'Open a shift before recording a customer credit payment';
  end if;

  insert into public.customer_credit_entries (
    restaurant_id, account_id, entry_type, amount, payment_method,
    note, actor_user_id
  ) values (
    target_restaurant_id, saved_account.id, 'payment',
    -round(requested_amount, 2), requested_payment_method,
    nullif(trim(requested_note), ''), event_actor_user_id
  ) returning id into created_entry_id;

  insert into public.shift_other_income_entries (
    restaurant_id, shift_id, category, amount, payment_method,
    description, reference, recorded_by_user_id, customer_credit_entry_id
  ) values (
    target_restaurant_id, open_shift_id, 'customer_credit_repayment',
    round(requested_amount, 2), requested_payment_method,
    'Credit repayment from ' || saved_customer.name,
    'Customer ' || upper(right(saved_customer.id::text, 8)),
    event_actor_user_id, created_entry_id
  );

  return created_entry_id;
end;
$credit_payment$;

create or replace function public.write_off_customer_credit(
  target_restaurant_id uuid,
  target_customer_id uuid,
  requested_amount numeric,
  requested_note text,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $credit_write_off$
declare
  actor_role text;
  saved_account_id uuid;
  current_balance numeric(12, 2);
  created_entry_id uuid;
begin
  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);
  if actor_role is null or actor_role not in ('restaurant_admin', 'owner') then
    raise exception 'Only an owner or restaurant admin can write off credit';
  end if;
  if requested_amount is null or requested_amount <= 0
    or nullif(trim(requested_note), '') is null
    or char_length(trim(requested_note)) > 300 then
    raise exception 'A valid amount and write-off reason are required';
  end if;
  select id into saved_account_id from public.customer_credit_accounts
  where customer_id = target_customer_id and restaurant_id = target_restaurant_id
  for update;
  if not found then raise exception 'Customer credit account not found'; end if;
  select coalesce(sum(amount), 0) into current_balance
  from public.customer_credit_entries
  where restaurant_id = target_restaurant_id and account_id = saved_account_id;
  current_balance := greatest(current_balance, 0);
  if round(requested_amount, 2) > current_balance then
    raise exception 'Write-off exceeds the outstanding balance';
  end if;
  insert into public.customer_credit_entries (
    restaurant_id, account_id, entry_type, amount, note, actor_user_id
  ) values (
    target_restaurant_id, saved_account_id, 'write_off',
    -round(requested_amount, 2), trim(requested_note), event_actor_user_id
  ) returning id into created_entry_id;
  return created_entry_id;
end;
$credit_write_off$;

create or replace function public.customer_credit_portfolio(target_restaurant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $credit_portfolio$
  with local_day as (
    select (now() at time zone coalesce(time_zone, 'Asia/Dubai'))::date as today
    from public.restaurants where id = target_restaurant_id
  ), account_totals as (
    select account.id, account.is_enabled,
      greatest(coalesce(sum(entry.amount), 0), 0)::numeric(12, 2) as balance,
      greatest(
        least(
          greatest(coalesce(sum(entry.amount), 0), 0),
          coalesce(sum(entry.amount) filter (
            where entry.amount > 0 and entry.due_date < local_day.today
          ), 0) - coalesce(abs(sum(entry.amount) filter (where entry.amount < 0)), 0)
        ), 0
      )::numeric(12, 2) as overdue
    from public.customer_credit_accounts account
    cross join local_day
    left join public.customer_credit_entries entry
      on entry.account_id = account.id and entry.restaurant_id = account.restaurant_id
    where account.restaurant_id = target_restaurant_id
    group by account.id, account.is_enabled, local_day.today
  )
  select jsonb_build_object(
    'enabled_customers', count(*) filter (where is_enabled),
    'outstanding', coalesce(sum(balance), 0),
    'overdue', coalesce(sum(overdue), 0)
  ) from account_totals;
$credit_portfolio$;

-- Add credit portfolio facts to the existing owner report without changing
-- the established sales/order calculations.
create or replace function public.daily_owner_report_insights(
  rid uuid,
  target_day date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $daily_owner_report$
with tenant as (
  select time_zone from public.restaurants where id = rid
), bounds as (
  select target_day::timestamp at time zone tenant.time_zone as day_start,
    (target_day + 1)::timestamp at time zone tenant.time_zone as day_end
  from tenant
), current_orders as (
  select o.items, o.payment_method, o.total
  from public.orders o cross join bounds b
  where o.restaurant_id = rid and o.status = 'Completed'
    and o.created_at >= b.day_start and o.created_at < b.day_end
), item_totals as (
  select trim(item ->> 'name') as name,
    sum(coalesce((item ->> 'quantity')::numeric, 0)) as qty
  from current_orders
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(current_orders.items::jsonb) = 'array'
      then current_orders.items::jsonb else '[]'::jsonb end
  ) item
  where nullif(trim(item ->> 'name'), '') is not null
  group by trim(item ->> 'name')
), top_items as (
  select name, qty from item_totals order by qty desc, name limit 3
), payment_totals as (
  select coalesce(payment_method::text, 'Unrecorded') as payment_method,
    count(*)::integer as order_count,
    coalesce(sum(total), 0)::numeric(12, 2) as sales
  from current_orders group by coalesce(payment_method::text, 'Unrecorded')
), credit_account_totals as (
  select
    entry.account_id,
    greatest(coalesce(sum(entry.amount), 0), 0)::numeric(12, 2) as outstanding,
    greatest(
      least(
        greatest(coalesce(sum(entry.amount), 0), 0),
        coalesce(sum(entry.amount) filter (
          where entry.amount > 0 and entry.due_date < target_day
        ), 0) - coalesce(abs(sum(entry.amount) filter (where entry.amount < 0)), 0)
      ), 0
    )::numeric(12, 2) as overdue
  from public.customer_credit_entries entry cross join bounds
  where entry.restaurant_id = rid and entry.created_at < bounds.day_end
  group by entry.account_id
), credit_day_totals as (
  select
    coalesce(sum(entry.amount) filter (
      where entry.entry_type = 'charge' and entry.created_at >= bounds.day_start
        and entry.created_at < bounds.day_end
    ), 0)::numeric(12, 2) as issued,
    coalesce(abs(sum(entry.amount) filter (
      where entry.entry_type = 'payment' and entry.created_at >= bounds.day_start
        and entry.created_at < bounds.day_end
    )), 0)::numeric(12, 2) as collected
  from public.customer_credit_entries entry cross join bounds
  where entry.restaurant_id = rid
), credit_totals as (
  select
    coalesce((select sum(outstanding) from credit_account_totals), 0)::numeric(12, 2) as outstanding,
    coalesce((select sum(overdue) from credit_account_totals), 0)::numeric(12, 2) as overdue,
    credit_day_totals.issued,
    credit_day_totals.collected
  from credit_day_totals
)
select jsonb_build_object(
  'top_items', (select coalesce(jsonb_agg(
    jsonb_build_object('name', name, 'qty', qty) order by qty desc, name
  ), '[]'::jsonb) from top_items),
  'payment_breakdown', (select coalesce(jsonb_object_agg(
    payment_method, jsonb_build_object('orders', order_count, 'sales', sales)
  ), '{}'::jsonb) from payment_totals),
  'credit', (select jsonb_build_object(
    'outstanding', outstanding, 'overdue', overdue,
    'issued', issued, 'collected', collected
  ) from credit_totals)
);
$daily_owner_report$;

alter table public.customer_credit_accounts enable row level security;
alter table public.customer_credit_entries enable row level security;
alter table public.customer_credit_reminders enable row level security;

revoke all on public.customer_credit_accounts, public.customer_credit_entries,
  public.customer_credit_reminders from public, anon, authenticated;
grant select on public.customer_credit_accounts, public.customer_credit_entries,
  public.customer_credit_reminders to authenticated;
grant all on public.customer_credit_accounts, public.customer_credit_entries,
  public.customer_credit_reminders to service_role;

create policy customer_credit_accounts_management_read
on public.customer_credit_accounts for select to authenticated
using (
  public.is_restaurant_member(
    restaurant_id, array['restaurant_admin', 'owner', 'manager']
  ) or public.is_super_admin()
);
create policy customer_credit_entries_management_read
on public.customer_credit_entries for select to authenticated
using (
  public.is_restaurant_member(
    restaurant_id, array['restaurant_admin', 'owner', 'manager']
  ) or public.is_super_admin()
);
create policy customer_credit_reminders_management_read
on public.customer_credit_reminders for select to authenticated
using (
  public.is_restaurant_member(
    restaurant_id, array['restaurant_admin', 'owner', 'manager']
  ) or public.is_super_admin()
);

revoke all on function public.configure_customer_credit_account(
  uuid, uuid, boolean, numeric, integer, boolean, numeric, uuid
) from public, anon, authenticated;
revoke all on function public.create_credit_customer_account(
  uuid, text, text, numeric, integer, boolean, numeric, uuid
) from public, anon, authenticated;
revoke all on function public.record_customer_credit_order(uuid, uuid, uuid)
from public, anon, authenticated;
revoke all on function public.record_customer_credit_payment(
  uuid, uuid, numeric, text, text, uuid
) from public, anon, authenticated;
revoke all on function public.write_off_customer_credit(
  uuid, uuid, numeric, text, uuid
) from public, anon, authenticated;
revoke all on function public.customer_credit_portfolio(uuid)
from public, anon, authenticated;
revoke all on function public.daily_owner_report_insights(uuid, date)
from public, anon, authenticated;

grant execute on function public.configure_customer_credit_account(
  uuid, uuid, boolean, numeric, integer, boolean, numeric, uuid
) to service_role;
grant execute on function public.create_credit_customer_account(
  uuid, text, text, numeric, integer, boolean, numeric, uuid
) to service_role;
grant execute on function public.record_customer_credit_order(uuid, uuid, uuid)
to service_role;
grant execute on function public.record_customer_credit_payment(
  uuid, uuid, numeric, text, text, uuid
) to service_role;
grant execute on function public.write_off_customer_credit(
  uuid, uuid, numeric, text, uuid
) to service_role;
grant execute on function public.customer_credit_portfolio(uuid)
to service_role;
grant execute on function public.daily_owner_report_insights(uuid, date)
to service_role;

do $verify_customer_credit$
begin
  if has_table_privilege('authenticated', 'public.customer_credit_accounts', 'insert')
    or has_table_privilege('authenticated', 'public.customer_credit_entries', 'insert')
    or has_table_privilege('authenticated', 'public.customer_credit_reminders', 'insert') then
    raise exception 'Customer credit writes must remain service-role-only';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'customer_credit_entries_immutable' and not tgisinternal
  ) then
    raise exception 'Customer credit ledger immutability trigger is missing';
  end if;
end;
$verify_customer_credit$;

notify pgrst, 'reload schema';
