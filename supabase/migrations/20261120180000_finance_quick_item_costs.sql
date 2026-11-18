-- Smart Finance Simple mode, release 2: quick food cost per menu item.
-- Requires 20261111160000 (cost engine) and 20261120150000 (risk fixes).
--
-- A beginner answers "What does one of these cost you to make? (about)" per
-- menu item instead of building full recipes. Each answer is stored with the
-- existing cost engine: a hidden "quick cost" ingredient per item (unit: each),
-- its price, and a one-line recipe "1 × quick cost". Add-ons of that item get
-- an empty recipe (their cost is included in the item's cost), so orders with
-- add-ons are still fully costed. Nothing in the cost engine changes.

alter table public.finance_ingredients
  add column quick_menu_item_id uuid;
create unique index finance_ingredients_quick_item
  on public.finance_ingredients(restaurant_id, quick_menu_item_id)
  where quick_menu_item_id is not null;
comment on column public.finance_ingredients.quick_menu_item_id is
  'Set on the hidden ingredient that holds a menu item''s quick cost (Simple mode).';

-- Save (or change) the quick cost of one menu item.
-- requested_first_effective_on: the date a NEW quick cost starts counting from
-- (so recent past orders can be re-costed). Later changes count from today.
create or replace function public.set_finance_quick_item_cost(
  target_restaurant_id uuid,
  target_menu_item_id uuid,
  requested_cost_fils bigint,
  requested_first_effective_on date,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $set_finance_quick_item_cost$
declare
  item_row public.menu_items;
  today date;
  quick_ingredient_id uuid;
  active_recipe_id uuid;
  is_quick_recipe boolean;
  first_time boolean := false;
  option_row record;
begin
  if not exists (select 1 from public.restaurants where id = target_restaurant_id and finance_enabled) then
    raise exception 'Finance is not enabled for this restaurant';
  end if;
  if requested_cost_fils is null or requested_cost_fils <= 0 or requested_cost_fils > 100000000 then
    raise exception 'Enter a cost greater than zero';
  end if;
  select * into item_row from public.menu_items
  where id = target_menu_item_id and restaurant_id = target_restaurant_id;
  if item_row.id is null then raise exception 'Invalid menu item'; end if;
  select (now() at time zone time_zone)::date into today from public.restaurants where id = target_restaurant_id;
  if requested_first_effective_on is null or requested_first_effective_on > today
     or requested_first_effective_on < today - 400 then
    raise exception 'Invalid start date';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    target_restaurant_id::text || ':' || target_menu_item_id::text || ':quick-cost', 0
  ));

  -- A full recipe takes precedence; don't overwrite it.
  select recipe.id into active_recipe_id from public.finance_recipes recipe
  where recipe.restaurant_id = target_restaurant_id and recipe.menu_item_id = target_menu_item_id
    and recipe.menu_option_id is null and recipe.status = 'active'
  order by recipe.effective_from desc limit 1;

  select id into quick_ingredient_id from public.finance_ingredients
  where restaurant_id = target_restaurant_id and quick_menu_item_id = target_menu_item_id;

  if active_recipe_id is not null then
    select coalesce(bool_and(line.ingredient_id = quick_ingredient_id), false)
      and count(*) = 1
    into is_quick_recipe
    from public.finance_recipe_lines line where line.recipe_id = active_recipe_id;
    if not is_quick_recipe then
      raise exception 'This item uses a full recipe';
    end if;
  end if;

  if quick_ingredient_id is null then
    insert into public.finance_ingredients (
      restaurant_id, name, kind, canonical_unit, yield_pct, quick_menu_item_id, created_by, updated_by
    ) values (
      target_restaurant_id,
      left('Quick cost · ' || trim(item_row.name), 100) || ' · ' || left(target_menu_item_id::text, 8),
      'ingredient', 'each', 100, target_menu_item_id, event_actor_user_id, event_actor_user_id
    ) returning id into quick_ingredient_id;
    first_time := true;
  elsif not exists (select 1 from public.finance_purchase_prices where ingredient_id = quick_ingredient_id) then
    first_time := true;
  end if;

  perform public.confirm_finance_purchase_price(
    target_restaurant_id, quick_ingredient_id, null, 'Quick cost',
    case when first_time then requested_first_effective_on else today end,
    1, 1, 'each', requested_cost_fils, event_actor_user_id
  );

  if active_recipe_id is null then
    perform public.create_finance_recipe_revision(
      target_restaurant_id, target_menu_item_id, null, requested_first_effective_on,
      jsonb_build_array(jsonb_build_object('ingredient_id', quick_ingredient_id, 'canonical_quantity', 1, 'waste_pct', 0)),
      event_actor_user_id
    );
  end if;

  -- Add-ons are included in the item's quick cost.
  for option_row in
    select option.id from public.menu_options option
    join public.menu_item_option_groups link
      on link.group_id = option.group_id and link.restaurant_id = option.restaurant_id
    where link.menu_item_id = target_menu_item_id and option.restaurant_id = target_restaurant_id
      and not exists (
        select 1 from public.finance_recipes recipe
        where recipe.restaurant_id = target_restaurant_id and recipe.menu_item_id = target_menu_item_id
          and recipe.menu_option_id = option.id and recipe.status = 'active'
      )
  loop
    perform public.create_finance_recipe_revision(
      target_restaurant_id, target_menu_item_id, option_row.id, requested_first_effective_on,
      '[]'::jsonb, event_actor_user_id
    );
  end loop;

  return quick_ingredient_id;
end;
$set_finance_quick_item_cost$;

-- Menu items with their current quick cost, for the Simple-mode screen.
create or replace function public.get_finance_quick_item_costs(target_restaurant_id uuid)
returns table (
  menu_item_id uuid, name text, price numeric, is_available boolean,
  quick_cost_fils bigint, has_full_recipe boolean
)
language sql stable security invoker set search_path = public
as $get_finance_quick_item_costs$
  select item.id, item.name, item.price, item.is_available,
    (select price.total_cost_fils from public.finance_purchase_prices price
     join public.finance_ingredients ingredient on ingredient.id = price.ingredient_id
     where ingredient.restaurant_id = target_restaurant_id and ingredient.quick_menu_item_id = item.id
     order by price.effective_on desc, price.created_at desc limit 1),
    exists (
      select 1 from public.finance_recipes recipe
      join public.finance_recipe_lines line on line.recipe_id = recipe.id
      join public.finance_ingredients ingredient on ingredient.id = line.ingredient_id
      where recipe.restaurant_id = target_restaurant_id and recipe.menu_item_id = item.id
        and recipe.menu_option_id is null and recipe.status = 'active'
        and ingredient.quick_menu_item_id is distinct from item.id
    )
  from public.menu_items item
  where item.restaurant_id = target_restaurant_id
  order by item.is_available desc, item.name;
$get_finance_quick_item_costs$;

-- Re-cost completed orders in a period that have no cost yet or an
-- incomplete one (e.g. after adding quick costs). Complete costs are kept.
create or replace function public.recost_finance_incomplete_orders(
  target_restaurant_id uuid, requested_start date, requested_end date,
  requested_limit integer default 1000
)
returns jsonb language plpgsql security invoker set search_path = public
as $recost_finance_incomplete_orders$
declare
  order_row record;
  processed integer := 0;
  created_count integer := 0;
begin
  if requested_end < requested_start or requested_end - requested_start > 400
     or requested_limit < 1 or requested_limit > 2000 then
    raise exception 'Invalid finance recost range';
  end if;
  for order_row in
    select orders.id from public.orders
    join public.restaurants on restaurants.id = orders.restaurant_id
    where orders.restaurant_id = target_restaurant_id and orders.status = 'Completed'
      and (orders.created_at at time zone restaurants.time_zone)::date
        between requested_start and requested_end
      and (
        not exists (select 1 from public.finance_product_cost_snapshots s where s.order_id = orders.id)
        or exists (select 1 from public.finance_product_cost_snapshots s
                   where s.order_id = orders.id and s.completeness <> 'complete')
      )
    order by orders.created_at, orders.id limit requested_limit
  loop
    processed := processed + 1;
    -- Clear incomplete lines here (snapshot_finance_order_costs' own
    -- replace_incomplete path has an ambiguous column reference), then rebuild.
    delete from public.finance_product_cost_snapshots snapshot
    where snapshot.restaurant_id = target_restaurant_id and snapshot.order_id = order_row.id
      and snapshot.completeness <> 'complete';
    created_count := created_count + public.snapshot_finance_order_costs(
      target_restaurant_id, order_row.id, false
    );
  end loop;
  return jsonb_build_object('orders_processed', processed, 'snapshots_created', created_count);
end;
$recost_finance_incomplete_orders$;

revoke all on function
  public.set_finance_quick_item_cost(uuid, uuid, bigint, date, uuid),
  public.get_finance_quick_item_costs(uuid),
  public.recost_finance_incomplete_orders(uuid, date, date, integer)
from public, anon, authenticated;
grant execute on function
  public.set_finance_quick_item_cost(uuid, uuid, bigint, date, uuid),
  public.get_finance_quick_item_costs(uuid),
  public.recost_finance_incomplete_orders(uuid, date, date, integer)
to service_role;

notify pgrst, 'reload schema';

-- Rollback: drop the three functions, the finance_ingredients_quick_item index
-- and the quick_menu_item_id column. Quick-cost ingredients, prices and recipes
-- created by it stay as ordinary costing data (archive them from Recipes).
