-- Smart Finance risk fixes (review of 17 Nov 2026).
-- Requires 20261111120000..20261120120000.
--
-- 1. Completing an order can never be blocked by Finance: the cost-snapshot
--    trigger runs only for Finance-enabled restaurants and a costing error is
--    logged as a warning instead of cancelling the status change.
-- 3. Pausing a recurring cost no longer rewrites history: pauses are dated
--    (paused_on) and resuming starts a new schedule row from that day.
-- 4. Scanned bills can carry a service period and a recurring-cost link
--    (new *_v2 approve functions; the old ones stay for already-loaded pages).
-- 5. Weighted-average ingredient cost only looks at the last 90 days and uses
--    the yield in force when each price was confirmed.
-- 6. Pilot controls work for any enrolled restaurant, not only the chaixpress link.
-- 7. Partial payments record how much was actually paid (paid_amount_fils).
--
-- Shift cash calculations are not changed.

-- 1 ---------------------------------------------------------------------------
create or replace function public.snapshot_finance_completed_order()
returns trigger language plpgsql security definer set search_path = public
as $snapshot_finance_completed_order$
begin
  if new.status = 'Completed' and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and exists (select 1 from public.restaurants
                 where id = new.restaurant_id and finance_enabled) then
    begin
      perform public.snapshot_finance_order_costs(new.restaurant_id, new.id, false);
    exception when others then
      -- Never block the order. Missing snapshots can be rebuilt from the
      -- Finance overview ("Calculate costs for past orders").
      raise warning 'Finance cost snapshot skipped for order %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$snapshot_finance_completed_order$;

-- 5 ---------------------------------------------------------------------------
create or replace function public.snapshot_finance_order_costs(
  target_restaurant_id uuid, target_order_id uuid, replace_incomplete boolean default false
)
returns integer language plpgsql security invoker set search_path = public
as $snapshot_finance_order_costs$
declare
  order_row public.orders;
  settings_row public.finance_settings;
  item jsonb;
  option_item jsonb;
  recipe_row public.finance_recipes;
  recipe_line record;
  price_row record;
  business_date date;
  item_index integer := -1;
  item_quantity integer;
  item_id uuid;
  option_id uuid;
  option_ids uuid[];
  recipe_ids uuid[];
  basis jsonb;
  unit_cost numeric;
  completeness text;
  base_recipe_found boolean;
  option_recipe_found boolean;
  snapshot_count integer := 0;
  use_latest_price boolean;
begin
  select * into order_row from public.orders
  where id = target_order_id and restaurant_id = target_restaurant_id and status = 'Completed';
  if order_row.id is null then return 0; end if;
  select * into settings_row from public.finance_settings where restaurant_id = target_restaurant_id;
  select (order_row.created_at at time zone restaurant.time_zone)::date into business_date
  from public.restaurants restaurant where restaurant.id = target_restaurant_id;
  if replace_incomplete then
    delete from public.finance_product_cost_snapshots
    where restaurant_id = target_restaurant_id and order_id = target_order_id
      and completeness <> 'complete';
  end if;
  for item in select value from jsonb_array_elements(
    case when jsonb_typeof(order_row.items) = 'array' then order_row.items else '[]'::jsonb end
  ) loop
    item_index := item_index + 1;
    if exists (select 1 from public.finance_product_cost_snapshots where order_id = target_order_id and line_index = item_index) then
      continue;
    end if;
    item_quantity := greatest(coalesce(nullif(item->>'quantity', '')::integer, 1), 1);
    item_id := case when coalesce(item->>'item_id', '') ~* '^[0-9a-f-]{36}$' then (item->>'item_id')::uuid else null end;
    option_ids := '{}'; recipe_ids := '{}'; basis := '[]'::jsonb; unit_cost := 0;
    completeness := 'complete'; base_recipe_found := false;
    if item_id is null or not exists (
      select 1 from public.menu_items where id = item_id and restaurant_id = target_restaurant_id
    ) then completeness := 'missing_item'; end if;
    if completeness = 'complete' then
      for recipe_row in select * from public.finance_recipes
        where restaurant_id = target_restaurant_id and menu_item_id = item_id
          and menu_option_id is null and effective_from <= business_date
          and (effective_to is null or effective_to >= business_date)
        order by effective_from desc limit 1
      loop
        base_recipe_found := true; recipe_ids := array_append(recipe_ids, recipe_row.id);
        for recipe_line in select line.*, ingredient.name from public.finance_recipe_lines line
          join public.finance_ingredients ingredient on ingredient.id = line.ingredient_id
          where line.recipe_id = recipe_row.id order by line.display_order
        loop
          price_row := null;
          use_latest_price := true;
          if settings_row.cost_basis = 'weighted_average' then
            -- Purchases in the 90 days up to the order's business day, weighted by
            -- usable quantity. Usable quantity comes from each price's stored
            -- normalized cost, so the yield in force when it was confirmed is used.
            select null::uuid as id,
              sum(price.total_cost_fils)::numeric /
                nullif(sum(price.total_cost_fils::numeric / price.normalized_unit_cost_fils), 0)
                as normalized_unit_cost_fils
            into price_row
            from public.finance_purchase_prices price
            where price.restaurant_id = target_restaurant_id
              and price.ingredient_id = recipe_line.ingredient_id
              and price.effective_on <= business_date
              and price.effective_on > business_date - 90;
            use_latest_price := price_row.normalized_unit_cost_fils is null;
          end if;
          if use_latest_price then
            -- Latest confirmed price (also the fallback when nothing was bought in 90 days).
            select price.id, price.normalized_unit_cost_fils into price_row
            from public.finance_purchase_prices price
            where price.restaurant_id = target_restaurant_id
              and price.ingredient_id = recipe_line.ingredient_id and price.effective_on <= business_date
            order by price.effective_on desc, price.created_at desc limit 1;
          end if;
          if price_row.normalized_unit_cost_fils is null then completeness := 'missing_price';
          else
            unit_cost := unit_cost + recipe_line.canonical_quantity
              * (100 + recipe_line.waste_pct) / 100 * price_row.normalized_unit_cost_fils;
            basis := basis || jsonb_build_array(jsonb_build_object(
              'ingredient_id', recipe_line.ingredient_id, 'price_id', price_row.id,
              'unit_cost_fils', price_row.normalized_unit_cost_fils
            ));
          end if;
        end loop;
      end loop;
      if not base_recipe_found then completeness := 'missing_recipe'; end if;
    end if;
    if completeness in ('complete', 'missing_price') and jsonb_typeof(item->'options') = 'array' then
      for option_item in select value from jsonb_array_elements(item->'options') loop
        option_id := case when coalesce(option_item->>'option_id', '') ~* '^[0-9a-f-]{36}$'
          then (option_item->>'option_id')::uuid else null end;
        if option_id is null then completeness := 'missing_option_recipe'; continue; end if;
        option_ids := array_append(option_ids, option_id); option_recipe_found := false;
        for recipe_row in select * from public.finance_recipes
          where restaurant_id = target_restaurant_id and menu_item_id = item_id
            and menu_option_id = option_id and effective_from <= business_date
            and (effective_to is null or effective_to >= business_date)
          order by effective_from desc limit 1
        loop
          option_recipe_found := true; recipe_ids := array_append(recipe_ids, recipe_row.id);
          for recipe_line in select line.* from public.finance_recipe_lines line
            where line.recipe_id = recipe_row.id order by line.display_order
          loop
            price_row := null;
            use_latest_price := true;
            if settings_row.cost_basis = 'weighted_average' then
              -- Purchases in the 90 days up to the order's business day, weighted by
              -- usable quantity. Usable quantity comes from each price's stored
              -- normalized cost, so the yield in force when it was confirmed is used.
              select null::uuid as id,
                sum(price.total_cost_fils)::numeric /
                  nullif(sum(price.total_cost_fils::numeric / price.normalized_unit_cost_fils), 0)
                  as normalized_unit_cost_fils
              into price_row
              from public.finance_purchase_prices price
              where price.restaurant_id = target_restaurant_id
                and price.ingredient_id = recipe_line.ingredient_id
                and price.effective_on <= business_date
                and price.effective_on > business_date - 90;
              use_latest_price := price_row.normalized_unit_cost_fils is null;
            end if;
            if use_latest_price then
              -- Latest confirmed price (also the fallback when nothing was bought in 90 days).
              select price.id, price.normalized_unit_cost_fils into price_row
              from public.finance_purchase_prices price
              where price.restaurant_id = target_restaurant_id
                and price.ingredient_id = recipe_line.ingredient_id and price.effective_on <= business_date
              order by price.effective_on desc, price.created_at desc limit 1;
            end if;
            if price_row.normalized_unit_cost_fils is null then completeness := 'missing_price';
            else unit_cost := unit_cost + recipe_line.canonical_quantity
              * (100 + recipe_line.waste_pct) / 100 * price_row.normalized_unit_cost_fils;
              basis := basis || jsonb_build_array(jsonb_build_object(
                'ingredient_id', recipe_line.ingredient_id, 'price_id', price_row.id,
                'unit_cost_fils', price_row.normalized_unit_cost_fils, 'menu_option_id', option_id
              ));
            end if;
          end loop;
        end loop;
        if not option_recipe_found then completeness := 'missing_option_recipe'; end if;
      end loop;
    end if;
    insert into public.finance_product_cost_snapshots (
      restaurant_id, order_id, line_index, menu_item_id, option_ids, recipe_ids, quantity,
      line_revenue_fils, unit_direct_cost_fils, total_direct_cost_fils, completeness,
      cost_basis_revision
    ) values (
      target_restaurant_id, target_order_id, item_index, item_id, option_ids, recipe_ids,
      item_quantity, round(coalesce(nullif(item->>'price', '')::numeric, 0) * 100) * item_quantity,
      case when completeness = 'complete' then round(unit_cost)::bigint else null end,
      case when completeness = 'complete' then round(unit_cost * item_quantity)::bigint else null end,
      completeness, basis
    );
    snapshot_count := snapshot_count + 1;
  end loop;
  return snapshot_count;
end;
$snapshot_finance_order_costs$;

-- 3 ---------------------------------------------------------------------------
alter table public.finance_recurring_costs
  add column paused_on date,
  add column superseded_by uuid;
update public.finance_recurring_costs
  set paused_on = greatest(start_on, updated_at::date)
  where not is_active and paused_on is null;
alter table public.finance_recurring_costs
  add constraint finance_recurring_costs_pause_valid check (
    (is_active and paused_on is null and superseded_by is null)
    or (not is_active and paused_on is not null)
  ),
  add constraint finance_recurring_costs_superseded_tenant_fk
    foreign key (superseded_by, restaurant_id)
    references public.finance_recurring_costs(id, restaurant_id);

create or replace function public.pause_finance_recurring_cost(
  target_restaurant_id uuid, target_recurring_id uuid, event_actor_user_id uuid
)
returns boolean language plpgsql security invoker set search_path = public
as $pause_finance_recurring_cost$
begin
  update public.finance_recurring_costs cost
  set is_active = false,
      paused_on = greatest(cost.start_on, (now() at time zone restaurant.time_zone)::date),
      updated_by = event_actor_user_id
  from public.restaurants restaurant
  where restaurant.id = cost.restaurant_id
    and cost.id = target_recurring_id and cost.restaurant_id = target_restaurant_id
    and cost.is_active;
  return found;
end;
$pause_finance_recurring_cost$;

-- Resuming keeps the paused row as history and starts a new schedule today.
create or replace function public.resume_finance_recurring_cost(
  target_restaurant_id uuid, target_recurring_id uuid, event_actor_user_id uuid
)
returns uuid language plpgsql security invoker set search_path = public
as $resume_finance_recurring_cost$
declare
  old_row public.finance_recurring_costs;
  today date;
  new_id uuid;
begin
  select (now() at time zone time_zone)::date into today
  from public.restaurants where id = target_restaurant_id;
  select * into old_row from public.finance_recurring_costs
  where id = target_recurring_id and restaurant_id = target_restaurant_id
  for update;
  if old_row.id is null or old_row.is_active or old_row.superseded_by is not null then
    raise exception 'This recurring cost cannot be resumed';
  end if;
  if old_row.end_on is not null and old_row.end_on < today then
    raise exception 'This recurring cost has already ended';
  end if;
  insert into public.finance_recurring_costs (
    restaurant_id, category_id, description, amount_fils, frequency, allocation_months,
    start_on, end_on, next_due_on, created_by, updated_by
  ) values (
    target_restaurant_id, old_row.category_id, old_row.description, old_row.amount_fils,
    old_row.frequency, old_row.allocation_months, today, old_row.end_on,
    least(greatest(old_row.next_due_on, today), coalesce(old_row.end_on, greatest(old_row.next_due_on, today))),
    event_actor_user_id, event_actor_user_id
  ) returning id into new_id;
  update public.finance_recurring_costs
  set superseded_by = new_id, updated_by = event_actor_user_id
  where id = old_row.id and restaurant_id = target_restaurant_id;
  return new_id;
end;
$resume_finance_recurring_cost$;

-- 7 ---------------------------------------------------------------------------
alter table public.finance_expenses
  add column paid_amount_fils bigint,
  add constraint finance_expenses_paid_amount_valid check (
    paid_amount_fils is null
    or (payment_status = 'partial' and paid_amount_fils > 0 and paid_amount_fils < total_fils)
  );

create or replace function public.link_finance_paid_out_to_expense(
  target_restaurant_id uuid,
  target_paid_out_id uuid,
  target_expense_id uuid,
  confirm_mismatch boolean,
  requested_mismatch_reason text,
  event_actor_user_id uuid
)
returns uuid language plpgsql security invoker set search_path = public
as $link_finance_paid_out$
declare
  context record;
  expense_row public.finance_expenses;
  difference bigint;
  mismatch_text text := nullif(trim(coalesce(requested_mismatch_reason, '')), '');
  new_link_id uuid;
begin
  select * into context from public.finance_paid_out_context(target_restaurant_id, target_paid_out_id);
  if exists (select 1 from public.finance_paid_out_links
    where paid_out_id = target_paid_out_id and removed_at is null) then
    raise exception 'This paid-out is already linked or dismissed';
  end if;

  select * into expense_row from public.finance_expenses
  where id = target_expense_id and restaurant_id = target_restaurant_id
  for update;
  if expense_row.id is null or expense_row.status = 'void' then
    raise exception 'Expense not found or voided';
  end if;
  if exists (select 1 from public.finance_paid_out_links
    where expense_id = target_expense_id and removed_at is null) then
    raise exception 'This expense is already linked to another paid-out';
  end if;

  difference := context.paid_out_amount_fils - expense_row.total_fils;
  if difference <> 0 and (confirm_mismatch is not true or mismatch_text is null) then
    raise exception 'Amounts differ: confirm the mismatch and give a reason';
  end if;
  if mismatch_text is not null and char_length(mismatch_text) > 300 then
    raise exception 'Mismatch reason must be 300 characters or fewer';
  end if;

  -- The paid-out is the evidence of payment: cash, on the shift's business date.
  -- A short paid-out is a partial payment of exactly that amount.
  update public.finance_expenses
  set payment_method = 'cash',
      payment_status = case when context.paid_out_amount_fils < expense_row.total_fils
        then 'partial' else 'paid' end,
      paid_amount_fils = case when context.paid_out_amount_fils < expense_row.total_fils
        then context.paid_out_amount_fils else null end,
      paid_on = context.business_date,
      updated_by = event_actor_user_id
  where id = target_expense_id and restaurant_id = target_restaurant_id;

  insert into public.finance_paid_out_links (
    restaurant_id, paid_out_id, expense_id, status, paid_out_amount_fils,
    expense_total_fils, difference_fils, mismatch_reason, created_by, updated_by
  ) values (
    target_restaurant_id, target_paid_out_id, target_expense_id, 'linked',
    context.paid_out_amount_fils, expense_row.total_fils, difference,
    case when difference = 0 then null else mismatch_text end,
    event_actor_user_id, event_actor_user_id
  ) returning id into new_link_id;
  return new_link_id;
end;
$link_finance_paid_out$;

-- 6: pilot controls follow the enrollment, not a hard-coded store link -------
create or replace function public.advance_finance_pilot(
  target_restaurant_id uuid, requested_status text, requested_sample_start date,
  requested_sample_end date, event_actor_user_id uuid
)
returns jsonb language plpgsql security invoker set search_path = public
as $advance_finance_pilot$
declare
  readiness jsonb;
  current_status text;
begin
  -- Any restaurant with a pilot enrollment (not one hard-coded store link).
  if not exists (select 1 from public.finance_pilot_enrollments where restaurant_id = target_restaurant_id) then
    raise exception 'This restaurant is not enrolled in the Finance pilot';
  end if;
  if requested_status not in ('configured', 'reconciled', 'released', 'paused') then
    raise exception 'Invalid pilot status';
  end if;
  select status into current_status from public.finance_pilot_enrollments
  where restaurant_id = target_restaurant_id for update;
  readiness := public.get_finance_pilot_readiness(target_restaurant_id);
  if requested_status = 'configured' and coalesce((readiness->>'ready_for_reconciliation')::boolean, false) is false then
    raise exception 'Pilot configuration is incomplete';
  end if;
  if requested_status in ('reconciled', 'released') and (
    requested_sample_start is null or requested_sample_end is null
    or requested_sample_end < requested_sample_start
    or requested_sample_end - requested_sample_start > 31
    or coalesce((readiness->>'ready_for_release')::boolean, false) is false
  ) then raise exception 'Pilot reconciliation or coverage is incomplete'; end if;
  if requested_status = 'released' and current_status <> 'reconciled' then
    raise exception 'Pilot must be reconciled before release';
  end if;
  update public.finance_pilot_enrollments set
    status = requested_status,
    sample_start = coalesce(requested_sample_start, sample_start),
    sample_end = coalesce(requested_sample_end, sample_end),
    readiness_snapshot = readiness,
    reconciled_by = case when requested_status in ('reconciled', 'released') then event_actor_user_id else reconciled_by end,
    reconciled_at = case when requested_status = 'reconciled' then now() else reconciled_at end,
    released_at = case when requested_status = 'released' then now() else released_at end,
    updated_by = event_actor_user_id
  where restaurant_id = target_restaurant_id;
  return readiness || jsonb_build_object('status', requested_status);
end;
$advance_finance_pilot$;


-- 4 + 7: details a scanned bill can carry -----------------------------------
create or replace function public.finance_apply_expense_details(
  target_restaurant_id uuid,
  target_expense_id uuid,
  requested_service_period_start date,
  requested_service_period_end date,
  requested_recurring_cost_id uuid,
  requested_paid_amount_fils bigint,
  event_actor_user_id uuid
)
returns void language plpgsql security invoker set search_path = public
as $finance_apply_expense_details$
begin
  if (requested_service_period_start is null) <> (requested_service_period_end is null)
     or requested_service_period_end < requested_service_period_start then
    raise exception 'Invalid service period';
  end if;
  if requested_recurring_cost_id is not null and not exists (
    select 1 from public.finance_recurring_costs
    where id = requested_recurring_cost_id and restaurant_id = target_restaurant_id and is_active
  ) then
    raise exception 'Invalid recurring schedule';
  end if;
  if requested_service_period_start is null and requested_recurring_cost_id is null
     and requested_paid_amount_fils is null then
    return;
  end if;
  update public.finance_expenses set
    service_period_start = coalesce(requested_service_period_start, service_period_start),
    service_period_end = coalesce(requested_service_period_end, service_period_end),
    recurring_cost_id = coalesce(requested_recurring_cost_id, recurring_cost_id),
    paid_amount_fils = case when requested_paid_amount_fils is not null
      then requested_paid_amount_fils else paid_amount_fils end,
    updated_by = event_actor_user_id
  where id = target_expense_id and restaurant_id = target_restaurant_id;
end;
$finance_apply_expense_details$;

create or replace function public.approve_finance_document_v2(
  target_restaurant_id uuid,
  target_document_id uuid,
  requested_category_id uuid,
  requested_supplier_name text,
  requested_invoice_number text,
  requested_incurred_on date,
  requested_subtotal_fils bigint,
  requested_input_vat_fils bigint,
  requested_total_fils bigint,
  requested_vat_inclusive boolean,
  requested_payment_status text,
  requested_payment_method text,
  requested_paid_on date,
  requested_paid_amount_fils bigint,
  requested_description text,
  requested_lines jsonb,
  requested_service_period_start date,
  requested_service_period_end date,
  requested_recurring_cost_id uuid,
  event_actor_user_id uuid
)
returns uuid language plpgsql security invoker set search_path = public
as $approve_finance_document_v2$
declare
  new_expense_id uuid;
begin
  -- Idempotent like approve_finance_document: a repeated submit returns the
  -- already-posted expense without changing it.
  select id into new_expense_id from public.finance_expenses
  where restaurant_id = target_restaurant_id and source_document_id = target_document_id;
  if new_expense_id is not null then return new_expense_id; end if;
  if requested_payment_status = 'partial' and requested_paid_amount_fils is null then
    raise exception 'Enter how much has been paid';
  end if;
  new_expense_id := public.approve_finance_document(
    target_restaurant_id, target_document_id, requested_category_id,
    requested_supplier_name, requested_invoice_number, requested_incurred_on,
    requested_subtotal_fils, requested_input_vat_fils, requested_total_fils,
    requested_vat_inclusive, requested_payment_status, requested_payment_method,
    requested_paid_on, requested_description, requested_lines, event_actor_user_id
  );
  perform public.finance_apply_expense_details(
    target_restaurant_id, new_expense_id, requested_service_period_start,
    requested_service_period_end, requested_recurring_cost_id,
    case when requested_payment_status = 'partial' then requested_paid_amount_fils end,
    event_actor_user_id
  );
  return new_expense_id;
end;
$approve_finance_document_v2$;

create or replace function public.approve_finance_document_from_till_v2(
  target_restaurant_id uuid,
  target_document_id uuid,
  requested_category_id uuid,
  requested_supplier_name text,
  requested_invoice_number text,
  requested_incurred_on date,
  requested_subtotal_fils bigint,
  requested_input_vat_fils bigint,
  requested_total_fils bigint,
  requested_vat_inclusive boolean,
  requested_description text,
  requested_lines jsonb,
  requested_service_period_start date,
  requested_service_period_end date,
  requested_recurring_cost_id uuid,
  target_shift_id uuid,
  allow_same_amount_paid_out boolean,
  event_actor_user_id uuid
)
returns uuid language plpgsql security invoker set search_path = public
as $approve_finance_document_from_till_v2$
declare
  new_expense_id uuid;
begin
  new_expense_id := public.approve_finance_document_from_till(
    target_restaurant_id, target_document_id, requested_category_id,
    requested_supplier_name, requested_invoice_number, requested_incurred_on,
    requested_subtotal_fils, requested_input_vat_fils, requested_total_fils,
    requested_vat_inclusive, requested_description, requested_lines,
    target_shift_id, allow_same_amount_paid_out, event_actor_user_id
  );
  perform public.finance_apply_expense_details(
    target_restaurant_id, new_expense_id, requested_service_period_start,
    requested_service_period_end, requested_recurring_cost_id, null, event_actor_user_id
  );
  return new_expense_id;
end;
$approve_finance_document_from_till_v2$;

create or replace function public.approve_finance_paid_out_receipt_v2(
  target_restaurant_id uuid,
  target_document_id uuid,
  requested_category_id uuid,
  requested_supplier_name text,
  requested_invoice_number text,
  requested_incurred_on date,
  requested_subtotal_fils bigint,
  requested_input_vat_fils bigint,
  requested_total_fils bigint,
  requested_vat_inclusive boolean,
  requested_description text,
  requested_lines jsonb,
  requested_service_period_start date,
  requested_service_period_end date,
  requested_recurring_cost_id uuid,
  confirm_mismatch boolean,
  requested_mismatch_reason text,
  event_actor_user_id uuid
)
returns uuid language plpgsql security invoker set search_path = public
as $approve_finance_paid_out_receipt_v2$
declare
  new_expense_id uuid;
begin
  new_expense_id := public.approve_finance_paid_out_receipt(
    target_restaurant_id, target_document_id, requested_category_id,
    requested_supplier_name, requested_invoice_number, requested_incurred_on,
    requested_subtotal_fils, requested_input_vat_fils, requested_total_fils,
    requested_vat_inclusive, requested_description, requested_lines,
    confirm_mismatch, requested_mismatch_reason, event_actor_user_id
  );
  perform public.finance_apply_expense_details(
    target_restaurant_id, new_expense_id, requested_service_period_start,
    requested_service_period_end, requested_recurring_cost_id, null, event_actor_user_id
  );
  return new_expense_id;
end;
$approve_finance_paid_out_receipt_v2$;

revoke all on function
  public.pause_finance_recurring_cost(uuid, uuid, uuid),
  public.resume_finance_recurring_cost(uuid, uuid, uuid),
  public.finance_apply_expense_details(uuid, uuid, date, date, uuid, bigint, uuid),
  public.approve_finance_document_v2(uuid, uuid, uuid, text, text, date, bigint, bigint, bigint, boolean, text, text, date, bigint, text, jsonb, date, date, uuid, uuid),
  public.approve_finance_document_from_till_v2(uuid, uuid, uuid, text, text, date, bigint, bigint, bigint, boolean, text, jsonb, date, date, uuid, uuid, boolean, uuid),
  public.approve_finance_paid_out_receipt_v2(uuid, uuid, uuid, text, text, date, bigint, bigint, bigint, boolean, text, jsonb, date, date, uuid, boolean, text, uuid)
from public, anon, authenticated;
grant execute on function
  public.pause_finance_recurring_cost(uuid, uuid, uuid),
  public.resume_finance_recurring_cost(uuid, uuid, uuid),
  public.finance_apply_expense_details(uuid, uuid, date, date, uuid, bigint, uuid),
  public.approve_finance_document_v2(uuid, uuid, uuid, text, text, date, bigint, bigint, bigint, boolean, text, text, date, bigint, text, jsonb, date, date, uuid, uuid),
  public.approve_finance_document_from_till_v2(uuid, uuid, uuid, text, text, date, bigint, bigint, bigint, boolean, text, jsonb, date, date, uuid, uuid, boolean, uuid),
  public.approve_finance_paid_out_receipt_v2(uuid, uuid, uuid, text, text, date, bigint, bigint, bigint, boolean, text, jsonb, date, date, uuid, boolean, text, uuid)
to service_role;

comment on column public.finance_recurring_costs.paused_on is
  'First day the schedule stopped accruing. Reports count the schedule up to the day before.';
comment on column public.finance_expenses.paid_amount_fils is
  'For partially paid expenses: the amount actually paid. Null means the whole total (or unknown for older partial rows).';

notify pgrst, 'reload schema';

-- Rollback: re-apply snapshot_finance_completed_order and
-- snapshot_finance_order_costs from 20261111160000 and
-- link_finance_paid_out_to_expense from 20261119090000; drop the eight new
-- functions; drop finance_expenses.paid_amount_fils and the
-- finance_recurring_costs pause columns and constraints (export them first).
