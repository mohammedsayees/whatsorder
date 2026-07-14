-- Enforce per-order offer caps at the database write boundary. Application
-- validation provides the friendly error, while this trigger closes the race
-- between two concurrent additions to the same unpaid order.

create or replace function public.enforce_order_offer_quantity_limits()
returns trigger
language plpgsql
set search_path = public
as $enforce_offer_limits$
begin
  if new.items is null or jsonb_typeof(new.items) <> 'array' then
    return new;
  end if;

  if exists (
    select 1
    from (
      select
        line->>'offer_id' as offer_id,
        sum(greatest(coalesce((line->>'quantity')::integer, 0), 0)) as quantity,
        min((line->>'offer_max_quantity')::integer) as maximum_quantity
      from jsonb_array_elements(new.items) as line
      where nullif(line->>'offer_id', '') is not null
        and nullif(line->>'offer_max_quantity', '') is not null
      group by line->>'offer_id'
    ) as offer_totals
    where maximum_quantity <= 0
       or quantity > maximum_quantity
  ) then
    raise exception 'Offer quantity limit exceeded';
  end if;

  return new;
end;
$enforce_offer_limits$;

revoke all on function public.enforce_order_offer_quantity_limits() from public;

drop trigger if exists orders_enforce_offer_quantity_limits on public.orders;
create trigger orders_enforce_offer_quantity_limits
before insert or update of items on public.orders
for each row
execute function public.enforce_order_offer_quantity_limits();
