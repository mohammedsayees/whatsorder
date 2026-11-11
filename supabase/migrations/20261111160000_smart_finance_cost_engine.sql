-- Smart Finance milestone C: normalized ingredients, confirmed purchase costs,
-- effective-dated recipes, option/modifier coverage and immutable order-line snapshots.

alter table public.finance_role_permissions
  add column can_manage_costing boolean not null default false,
  add column can_view_reports boolean not null default false;

alter table public.finance_audit_events
  drop constraint if exists finance_audit_events_entity_type_check;
alter table public.finance_audit_events
  add constraint finance_audit_events_entity_type_check check (entity_type in (
    'expense', 'category', 'recurring_cost', 'role_permissions', 'finance_settings',
    'ingredient', 'purchase_price', 'recipe', 'order_channel'
  ));

create table public.finance_settings (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  cost_basis text not null default 'latest' check (cost_basis in ('latest', 'weighted_average')),
  prices_include_vat boolean not null default true,
  output_vat_rate_bps integer not null default 500 check (output_vat_rate_bps between 0 and 10000),
  direct_fee_bps integer not null default 0 check (direct_fee_bps between 0 and 10000),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.finance_ingredients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  kind text not null default 'ingredient' check (kind in ('ingredient', 'packaging')),
  canonical_unit text not null check (canonical_unit in ('g', 'ml', 'each')),
  yield_pct numeric(6, 3) not null default 100 check (yield_pct > 0 and yield_pct <= 100),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_ingredients_id_restaurant_unique unique (id, restaurant_id),
  constraint finance_ingredients_restaurant_name_unique unique (restaurant_id, name)
);

alter table public.finance_expense_lines
  add constraint finance_expense_lines_id_restaurant_unique unique (id, restaurant_id),
  add column ingredient_id uuid,
  add constraint finance_expense_lines_ingredient_tenant_fk
    foreign key (ingredient_id, restaurant_id)
    references public.finance_ingredients(id, restaurant_id);

alter table public.menu_options
  add constraint menu_options_id_restaurant_unique unique (id, restaurant_id);

create table public.finance_purchase_prices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  ingredient_id uuid not null,
  source_line_id uuid,
  supplier_name text check (supplier_name is null or char_length(trim(supplier_name)) between 1 and 160),
  effective_on date not null,
  pack_count numeric(14, 4) not null default 1 check (pack_count > 0),
  pack_size numeric(14, 4) not null check (pack_size > 0),
  pack_unit text not null check (pack_unit in ('g', 'kg', 'ml', 'l', 'each')),
  total_cost_fils bigint not null check (total_cost_fils > 0),
  normalized_unit_cost_fils numeric(20, 8) not null check (normalized_unit_cost_fils > 0),
  confirmed_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint finance_purchase_prices_id_restaurant_unique unique (id, restaurant_id),
  constraint finance_purchase_prices_ingredient_tenant_fk
    foreign key (ingredient_id, restaurant_id)
    references public.finance_ingredients(id, restaurant_id),
  constraint finance_purchase_prices_source_line_tenant_fk
    foreign key (source_line_id, restaurant_id)
    references public.finance_expense_lines(id, restaurant_id),
  constraint finance_purchase_prices_source_line_unique unique (source_line_id)
);

create table public.finance_recipes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id uuid not null,
  menu_option_id uuid,
  effective_from date not null,
  effective_to date,
  revision integer not null check (revision > 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint finance_recipes_id_restaurant_unique unique (id, restaurant_id),
  constraint finance_recipes_target_revision_unique
    unique (restaurant_id, menu_item_id, menu_option_id, revision),
  constraint finance_recipes_dates_valid check (effective_to is null or effective_to >= effective_from),
  constraint finance_recipes_menu_item_tenant_fk
    foreign key (menu_item_id, restaurant_id)
    references public.menu_items(id, restaurant_id) on delete cascade,
  constraint finance_recipes_menu_option_tenant_fk
    foreign key (menu_option_id, restaurant_id)
    references public.menu_options(id, restaurant_id) on delete cascade
);

create table public.finance_recipe_lines (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  recipe_id uuid not null,
  ingredient_id uuid not null,
  canonical_quantity numeric(16, 6) not null check (canonical_quantity > 0),
  waste_pct numeric(6, 3) not null default 0 check (waste_pct >= 0 and waste_pct <= 500),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  constraint finance_recipe_lines_recipe_ingredient_unique unique (recipe_id, ingredient_id),
  constraint finance_recipe_lines_recipe_tenant_fk
    foreign key (recipe_id, restaurant_id)
    references public.finance_recipes(id, restaurant_id) on delete cascade,
  constraint finance_recipe_lines_ingredient_tenant_fk
    foreign key (ingredient_id, restaurant_id)
    references public.finance_ingredients(id, restaurant_id)
);

create table public.finance_order_channels (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null,
  channel text not null default 'direct' check (
    channel in ('direct', 'talabat', 'noon', 'smiles', 'keeta', 'deliveroo', 'other')
  ),
  fee_bps integer not null default 0 check (fee_bps between 0 and 10000),
  promotion_fils bigint not null default 0 check (promotion_fils >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_order_channels_order_unique unique (order_id),
  constraint finance_order_channels_id_restaurant_unique unique (id, restaurant_id),
  constraint finance_order_channels_order_tenant_fk
    foreign key (order_id, restaurant_id)
    references public.orders(id, restaurant_id) on delete cascade
);

create table public.finance_product_cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null,
  line_index integer not null check (line_index >= 0),
  menu_item_id uuid,
  option_ids uuid[] not null default '{}',
  recipe_ids uuid[] not null default '{}',
  quantity integer not null check (quantity > 0),
  line_revenue_fils bigint not null check (line_revenue_fils >= 0),
  unit_direct_cost_fils bigint,
  total_direct_cost_fils bigint,
  completeness text not null check (
    completeness in ('complete', 'missing_item', 'missing_recipe', 'missing_option_recipe', 'missing_price')
  ),
  cost_basis_revision jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default now(),
  constraint finance_product_cost_snapshots_order_line_unique unique (order_id, line_index),
  constraint finance_product_cost_snapshots_id_restaurant_unique unique (id, restaurant_id),
  constraint finance_product_cost_snapshots_order_tenant_fk
    foreign key (order_id, restaurant_id)
    references public.orders(id, restaurant_id) on delete cascade,
  constraint finance_product_cost_snapshots_menu_item_tenant_fk
    foreign key (menu_item_id, restaurant_id)
    references public.menu_items(id, restaurant_id),
  constraint finance_product_cost_snapshots_cost_valid check (
    (completeness = 'complete' and unit_direct_cost_fils is not null and total_direct_cost_fils is not null)
    or (completeness <> 'complete' and unit_direct_cost_fils is null and total_direct_cost_fils is null)
  )
);

create index finance_purchase_prices_lookup
  on public.finance_purchase_prices(restaurant_id, ingredient_id, effective_on desc, created_at desc);
create index finance_recipes_effective
  on public.finance_recipes(restaurant_id, menu_item_id, menu_option_id, effective_from desc);
create index finance_recipe_lines_recipe
  on public.finance_recipe_lines(restaurant_id, recipe_id, display_order);
create index finance_product_cost_snapshots_period
  on public.finance_product_cost_snapshots(restaurant_id, order_id, completeness);

create trigger finance_settings_set_updated_at before update on public.finance_settings
for each row execute function public.set_updated_at();
create trigger finance_ingredients_set_updated_at before update on public.finance_ingredients
for each row execute function public.set_updated_at();
create trigger finance_order_channels_set_updated_at before update on public.finance_order_channels
for each row execute function public.set_updated_at();

insert into public.finance_settings (restaurant_id)
select id from public.restaurants on conflict (restaurant_id) do nothing;

create or replace function public.seed_finance_cost_settings_for_restaurant()
returns trigger language plpgsql security definer set search_path = public
as $seed_finance_cost_settings_for_restaurant$
begin
  insert into public.finance_settings (restaurant_id) values (new.id)
  on conflict (restaurant_id) do nothing;
  return new;
end;
$seed_finance_cost_settings_for_restaurant$;
create trigger restaurants_seed_finance_cost_settings after insert on public.restaurants
for each row execute function public.seed_finance_cost_settings_for_restaurant();

create or replace function public.finance_unit_multiplier(requested_unit text)
returns numeric language sql immutable set search_path = public
as $finance_unit_multiplier$
  select case lower(requested_unit)
    when 'kg' then 1000::numeric when 'l' then 1000::numeric
    when 'g' then 1::numeric when 'ml' then 1::numeric when 'each' then 1::numeric
    else null end;
$finance_unit_multiplier$;

create or replace function public.confirm_finance_purchase_price(
  target_restaurant_id uuid, target_ingredient_id uuid, target_source_line_id uuid,
  requested_supplier_name text, requested_effective_on date, requested_pack_count numeric,
  requested_pack_size numeric, requested_pack_unit text, requested_total_cost_fils bigint,
  event_actor_user_id uuid
)
returns uuid language plpgsql security invoker set search_path = public
as $confirm_finance_purchase_price$
declare
  ingredient_row public.finance_ingredients;
  source_row public.finance_expense_lines;
  usable_units numeric;
  price_id uuid;
begin
  select * into ingredient_row from public.finance_ingredients
  where id = target_ingredient_id and restaurant_id = target_restaurant_id and is_active;
  if ingredient_row.id is null then raise exception 'Invalid ingredient'; end if;
  if public.finance_unit_multiplier(requested_pack_unit) is null
     or (ingredient_row.canonical_unit = 'g' and requested_pack_unit not in ('g', 'kg'))
     or (ingredient_row.canonical_unit = 'ml' and requested_pack_unit not in ('ml', 'l'))
     or (ingredient_row.canonical_unit = 'each' and requested_pack_unit <> 'each') then
    raise exception 'Incompatible purchase unit';
  end if;
  if requested_pack_count <= 0 or requested_pack_size <= 0 or requested_total_cost_fils <= 0 then
    raise exception 'Invalid purchase price';
  end if;
  if target_source_line_id is not null then
    select * into source_row from public.finance_expense_lines
    where id = target_source_line_id and restaurant_id = target_restaurant_id;
    if source_row.id is null or source_row.classification <> 'purchase' then
      raise exception 'Invalid purchase source line';
    end if;
  end if;
  usable_units := requested_pack_count * requested_pack_size
    * public.finance_unit_multiplier(requested_pack_unit) * ingredient_row.yield_pct / 100;
  insert into public.finance_purchase_prices (
    restaurant_id, ingredient_id, source_line_id, supplier_name, effective_on,
    pack_count, pack_size, pack_unit, total_cost_fils, normalized_unit_cost_fils,
    confirmed_by
  ) values (
    target_restaurant_id, target_ingredient_id, target_source_line_id,
    nullif(trim(requested_supplier_name), ''), requested_effective_on,
    requested_pack_count, requested_pack_size, requested_pack_unit,
    requested_total_cost_fils, requested_total_cost_fils / usable_units,
    event_actor_user_id
  ) returning id into price_id;
  if target_source_line_id is not null then
    update public.finance_expense_lines set ingredient_id = target_ingredient_id
    where id = target_source_line_id and restaurant_id = target_restaurant_id;
  end if;
  return price_id;
end;
$confirm_finance_purchase_price$;

create or replace function public.create_finance_recipe_revision(
  target_restaurant_id uuid, target_menu_item_id uuid, target_menu_option_id uuid,
  requested_effective_from date, requested_lines jsonb, event_actor_user_id uuid
)
returns uuid language plpgsql security invoker set search_path = public
as $create_finance_recipe_revision$
declare
  new_recipe_id uuid;
  next_revision integer;
  line_record jsonb;
  line_index integer := 0;
begin
  if not exists (select 1 from public.menu_items where id = target_menu_item_id and restaurant_id = target_restaurant_id) then
    raise exception 'Invalid menu item';
  end if;
  if target_menu_option_id is not null and not exists (
    select 1 from public.menu_options option
    join public.menu_item_option_groups link
      on link.group_id = option.group_id and link.restaurant_id = option.restaurant_id
    where option.id = target_menu_option_id and option.restaurant_id = target_restaurant_id
      and link.menu_item_id = target_menu_item_id
  ) then raise exception 'Option is not linked to menu item'; end if;
  if jsonb_typeof(requested_lines) <> 'array' or jsonb_array_length(requested_lines) > 100 then
    raise exception 'Invalid recipe lines';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    target_restaurant_id::text || ':' || target_menu_item_id::text || ':' || coalesce(target_menu_option_id::text, 'base'), 0
  ));
  update public.finance_recipes set
    effective_to = requested_effective_from - 1, status = 'archived'
  where restaurant_id = target_restaurant_id and menu_item_id = target_menu_item_id
    and menu_option_id is not distinct from target_menu_option_id and status = 'active'
    and effective_from < requested_effective_from;
  if exists (
    select 1 from public.finance_recipes where restaurant_id = target_restaurant_id
      and menu_item_id = target_menu_item_id and menu_option_id is not distinct from target_menu_option_id
      and effective_from >= requested_effective_from
  ) then raise exception 'Recipe date overlaps an existing revision'; end if;
  select coalesce(max(revision), 0) + 1 into next_revision
  from public.finance_recipes where restaurant_id = target_restaurant_id
    and menu_item_id = target_menu_item_id and menu_option_id is not distinct from target_menu_option_id;
  insert into public.finance_recipes (
    restaurant_id, menu_item_id, menu_option_id, effective_from, revision, created_by
  ) values (
    target_restaurant_id, target_menu_item_id, target_menu_option_id,
    requested_effective_from, next_revision, event_actor_user_id
  ) returning id into new_recipe_id;
  for line_record in select value from jsonb_array_elements(requested_lines) loop
    line_index := line_index + 1;
    insert into public.finance_recipe_lines (
      restaurant_id, recipe_id, ingredient_id, canonical_quantity, waste_pct, display_order
    ) values (
      target_restaurant_id, new_recipe_id, (line_record->>'ingredient_id')::uuid,
      (line_record->>'canonical_quantity')::numeric,
      coalesce(nullif(line_record->>'waste_pct', '')::numeric, 0), line_index
    );
  end loop;
  return new_recipe_id;
end;
$create_finance_recipe_revision$;

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
          if settings_row.cost_basis = 'weighted_average' then
            select null::uuid as id,
              sum(price.total_cost_fils)::numeric /
                nullif(sum(price.pack_count * price.pack_size * public.finance_unit_multiplier(price.pack_unit)
                  * ingredient.yield_pct / 100), 0) as normalized_unit_cost_fils
            into price_row
            from public.finance_purchase_prices price
            join public.finance_ingredients ingredient on ingredient.id = price.ingredient_id
            where price.restaurant_id = target_restaurant_id
              and price.ingredient_id = recipe_line.ingredient_id and price.effective_on <= business_date;
          else
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
            if settings_row.cost_basis = 'weighted_average' then
              select null::uuid as id,
                sum(price.total_cost_fils)::numeric /
                  nullif(sum(price.pack_count * price.pack_size * public.finance_unit_multiplier(price.pack_unit)
                    * ingredient.yield_pct / 100), 0) as normalized_unit_cost_fils
              into price_row
              from public.finance_purchase_prices price
              join public.finance_ingredients ingredient on ingredient.id = price.ingredient_id
              where price.restaurant_id = target_restaurant_id
                and price.ingredient_id = recipe_line.ingredient_id and price.effective_on <= business_date;
            else
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

create or replace function public.snapshot_finance_completed_order()
returns trigger language plpgsql security definer set search_path = public
as $snapshot_finance_completed_order$
begin
  if new.status = 'Completed' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.snapshot_finance_order_costs(new.restaurant_id, new.id, false);
  end if;
  return new;
end;
$snapshot_finance_completed_order$;
create trigger orders_snapshot_finance_costs
after insert or update of status on public.orders
for each row execute function public.snapshot_finance_completed_order();

create or replace function public.capture_finance_audit_event()
returns trigger language plpgsql security definer set search_path = public
as $capture_finance_audit_event$
declare
  before_row jsonb; after_row jsonb; target_row jsonb; audit_entity_type text; audit_actor_id uuid;
begin
  before_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  after_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  target_row := coalesce(after_row, before_row);
  audit_entity_type := case tg_table_name
    when 'finance_expenses' then 'expense' when 'finance_categories' then 'category'
    when 'finance_recurring_costs' then 'recurring_cost' when 'finance_role_permissions' then 'role_permissions'
    when 'finance_settings' then 'finance_settings' when 'finance_ingredients' then 'ingredient'
    when 'finance_purchase_prices' then 'purchase_price' when 'finance_recipes' then 'recipe'
    when 'finance_order_channels' then 'order_channel' end;
  audit_actor_id := coalesce(nullif(target_row->>'updated_by', '')::uuid,
    nullif(target_row->>'confirmed_by', '')::uuid, nullif(target_row->>'created_by', '')::uuid,
    nullif(target_row->>'approved_by', '')::uuid);
  insert into public.finance_audit_events (
    restaurant_id, entity_type, entity_id, actor_id, action, before_state, after_state
  ) values ((target_row->>'restaurant_id')::uuid, audit_entity_type,
    coalesce(nullif(target_row->>'id', '')::uuid, (target_row->>'restaurant_id')::uuid),
    audit_actor_id, lower(tg_op), before_row, after_row);
  if tg_op = 'DELETE' then return old; end if; return new;
end;
$capture_finance_audit_event$;

create trigger finance_settings_audit after insert or update or delete on public.finance_settings
for each row execute function public.capture_finance_audit_event();
create trigger finance_ingredients_audit after insert or update or delete on public.finance_ingredients
for each row execute function public.capture_finance_audit_event();
create trigger finance_purchase_prices_audit after insert or update or delete on public.finance_purchase_prices
for each row execute function public.capture_finance_audit_event();
create trigger finance_recipes_audit after insert or update or delete on public.finance_recipes
for each row execute function public.capture_finance_audit_event();
create trigger finance_order_channels_audit after insert or update or delete on public.finance_order_channels
for each row execute function public.capture_finance_audit_event();

create or replace function public.has_finance_permission(target_restaurant_id uuid, requested_permission text)
returns boolean language sql stable security definer set search_path = public
as $has_finance_permission$
  select exists (
    select 1 from public.restaurant_users membership
    join public.restaurants restaurant on restaurant.id = membership.restaurant_id
    left join public.finance_role_permissions permission
      on permission.restaurant_id = membership.restaurant_id and permission.role = membership.role
    where membership.restaurant_id = target_restaurant_id and membership.user_id = auth.uid()
      and membership.accepted_at is not null and restaurant.finance_enabled = true
      and (membership.role in ('restaurant_admin', 'owner') or case requested_permission
        when 'view' then permission.can_view when 'create' then permission.can_create
        when 'approve' then permission.can_view and permission.can_approve
        when 'manage_categories' then permission.can_view and permission.can_manage_categories
        when 'manage_recurring' then permission.can_view and permission.can_manage_recurring
        when 'manage_costing' then permission.can_view and permission.can_manage_costing
        when 'view_reports' then permission.can_view and permission.can_view_reports
        else false end)
  );
$has_finance_permission$;

alter table public.finance_settings enable row level security;
alter table public.finance_ingredients enable row level security;
alter table public.finance_purchase_prices enable row level security;
alter table public.finance_recipes enable row level security;
alter table public.finance_recipe_lines enable row level security;
alter table public.finance_order_channels enable row level security;
alter table public.finance_product_cost_snapshots enable row level security;

revoke all on public.finance_settings, public.finance_ingredients, public.finance_purchase_prices,
  public.finance_recipes, public.finance_recipe_lines, public.finance_order_channels,
  public.finance_product_cost_snapshots from public, anon, authenticated;
grant select on public.finance_settings, public.finance_ingredients, public.finance_purchase_prices,
  public.finance_recipes, public.finance_recipe_lines, public.finance_order_channels,
  public.finance_product_cost_snapshots to authenticated;
grant all on public.finance_settings, public.finance_ingredients, public.finance_purchase_prices,
  public.finance_recipes, public.finance_recipe_lines, public.finance_order_channels,
  public.finance_product_cost_snapshots to service_role;

create policy finance_settings_permitted_read on public.finance_settings for select to authenticated
using (public.has_finance_permission(restaurant_id, 'view_reports'));
create policy finance_ingredients_permitted_read on public.finance_ingredients for select to authenticated
using (public.has_finance_permission(restaurant_id, 'manage_costing'));
create policy finance_purchase_prices_permitted_read on public.finance_purchase_prices for select to authenticated
using (public.has_finance_permission(restaurant_id, 'manage_costing'));
create policy finance_recipes_permitted_read on public.finance_recipes for select to authenticated
using (public.has_finance_permission(restaurant_id, 'manage_costing'));
create policy finance_recipe_lines_permitted_read on public.finance_recipe_lines for select to authenticated
using (public.has_finance_permission(restaurant_id, 'manage_costing'));
create policy finance_order_channels_permitted_read on public.finance_order_channels for select to authenticated
using (public.has_finance_permission(restaurant_id, 'view_reports'));
create policy finance_product_cost_snapshots_permitted_read on public.finance_product_cost_snapshots for select to authenticated
using (public.has_finance_permission(restaurant_id, 'view_reports'));

revoke all on function public.seed_finance_cost_settings_for_restaurant(),
  public.finance_unit_multiplier(text),
  public.confirm_finance_purchase_price(uuid, uuid, uuid, text, date, numeric, numeric, text, bigint, uuid),
  public.create_finance_recipe_revision(uuid, uuid, uuid, date, jsonb, uuid),
  public.snapshot_finance_order_costs(uuid, uuid, boolean),
  public.snapshot_finance_completed_order()
from public, anon, authenticated;
grant execute on function public.finance_unit_multiplier(text) to service_role;
grant execute on function public.confirm_finance_purchase_price(uuid, uuid, uuid, text, date, numeric, numeric, text, bigint, uuid),
  public.create_finance_recipe_revision(uuid, uuid, uuid, date, jsonb, uuid),
  public.snapshot_finance_order_costs(uuid, uuid, boolean)
to service_role;

do $verify_finance_cost_security$
begin
  if exists (select 1 from pg_policies where schemaname = 'public'
    and tablename in ('finance_settings', 'finance_ingredients', 'finance_purchase_prices',
      'finance_recipes', 'finance_recipe_lines', 'finance_order_channels', 'finance_product_cost_snapshots')
    and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) then
    raise exception 'Finance cost write policy detected';
  end if;
end;
$verify_finance_cost_security$;

comment on table public.finance_product_cost_snapshots is
  'Immutable order-line recipe cost facts. Missing data is explicit and never treated as zero cost.';
comment on table public.finance_purchase_prices is
  'Owner-confirmed purchase costs normalized to an ingredient canonical unit; AI cannot write this table.';
notify pgrst, 'reload schema';
