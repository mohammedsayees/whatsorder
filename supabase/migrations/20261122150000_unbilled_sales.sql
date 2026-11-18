-- Unbilled sales: money taken without an order (items unknown).
--
-- Closing notes like "non bill" / "difference due to non billing" showed sales
-- taken without punching an order: the drawer counted over and WhatsOrder
-- under-reported sales. If the items are known, staff should enter the missed
-- order (the New order page accepts an earlier time). When they aren't, the
-- shift can now record an unbilled sale.
--
-- It is stored as a shift receipt with the category 'unbilled_sale', so it
-- reuses everything receipts already do: it is added to expected cash / card /
-- UPI, it can be voided while the shift is open, staff can't change it after
-- locking a blind count, and it is itemized in every report version. The app
-- shows it as SALES (an "Unbilled sales" line, with no items or order count),
-- not as other income; total receipts already count it once.
--
-- 1. The category check allows 'unbilled_sale'.
-- 2. add_shift_other_income is re-declared with ONE change: it accepts
--    'unbilled_sale', paid by cash, card, or UPI (India only). Every other line
--    is identical to 20260722120000_other_income_business_days.sql.

begin;
set local lock_timeout = '5s';

alter table public.shift_other_income_entries
  drop constraint if exists shift_other_income_entries_category_check;
alter table public.shift_other_income_entries
  add constraint shift_other_income_entries_category_check check (
    category in (
      'used_oil_sale', 'scrap_sale', 'supplier_rebate', 'rental_income',
      'customer_credit_repayment', 'other', 'unbilled_sale'
    )
  );

create or replace function public.add_shift_other_income(
  target_restaurant_id uuid,
  target_shift_id uuid,
  requested_category text,
  requested_amount numeric,
  requested_payment_method text,
  requested_description text,
  requested_reference text,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $add_other_income$
declare
  actor_role text;
  shift_opener uuid;
  entry_id uuid;
begin
  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);
  select opened_by_user_id into shift_opener
  from public.restaurant_shifts
  where id = target_shift_id and restaurant_id = target_restaurant_id and status = 'open'
  for update;

  if not found then raise exception 'Open shift not found'; end if;
  if actor_role is null or (actor_role = 'staff' and shift_opener <> event_actor_user_id) then
    raise exception 'Only the shift opener or restaurant management can add other income';
  end if;
  if requested_category not in (
    'used_oil_sale', 'scrap_sale', 'supplier_rebate', 'rental_income', 'other', 'unbilled_sale'
  ) then
    raise exception 'Choose a valid other income category';
  end if;
  -- Unbilled sales are drawer sales: cash, card, or UPI where UPI is offered.
  if requested_category = 'unbilled_sale' and (
    requested_payment_method not in ('cash', 'card', 'upi')
    or (requested_payment_method = 'upi' and (
      select country_code from public.restaurants where id = target_restaurant_id
    ) is distinct from 'IN')
  ) then
    raise exception 'An unbilled sale must be paid by cash, card or UPI';
  end if;
  if requested_payment_method not in ('cash', 'card', 'upi', 'bank_transfer', 'other') then
    raise exception 'Choose a valid other income payment method';
  end if;
  if requested_amount is null or requested_amount <= 0 then
    raise exception 'Other income amount must be greater than zero';
  end if;
  if nullif(trim(requested_description), '') is null
     or char_length(trim(requested_description)) > 300 then
    raise exception 'An other income description is required';
  end if;

  insert into public.shift_other_income_entries (
    restaurant_id, shift_id, category, amount, payment_method,
    description, reference, recorded_by_user_id
  ) values (
    target_restaurant_id, target_shift_id, requested_category,
    round(requested_amount, 2), requested_payment_method,
    trim(requested_description), nullif(left(trim(requested_reference), 120), ''),
    event_actor_user_id
  ) returning id into entry_id;
  return entry_id;
end;
$add_other_income$;

revoke all on function public.add_shift_other_income(uuid, uuid, text, numeric, text, text, text, uuid)
from public, anon, authenticated;
grant execute on function public.add_shift_other_income(uuid, uuid, text, numeric, text, text, text, uuid)
to service_role;

notify pgrst, 'reload schema';

commit;

-- Rollback: void or reclassify unbilled_sale entries first; then re-apply
-- add_shift_other_income from 20260722120000 and the category check from
-- 20261110081000_customer_credit_ledger.sql.
