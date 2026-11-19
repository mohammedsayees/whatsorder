-- Itemized paid-outs and other-income entries in every shift report version.
--
-- Report snapshots held only totals; the report page listed paid-outs live
-- from the table, so an older version could show entries (or voids) that
-- happened after it was generated. Now each version records, at the moment it
-- is written:
--   paid_outs:            every paid-out of the shift, voided ones included
--   other_income_entries: every other-income entry, voided ones included
-- (voided rows keep voided_at and void_reason; they are not counted in totals).
--
-- A BEFORE INSERT OR UPDATE trigger on shift_close_reports adds both lists
-- whenever a snapshot is written without them. That covers every existing
-- writer (close, correction, live recalculation, and the same-transaction
-- snapshot patches they make) without changing any of those functions.
-- A snapshot that already has the lists is left as it is.
--
-- Existing report versions are NOT backfilled: today's entries could differ
-- from what those versions were generated from. The app falls back to the live
-- list for them.

begin;
set local lock_timeout = '5s';

create or replace function public.shift_report_itemized_entries(
  target_restaurant_id uuid,
  target_shift_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $itemized_entries$
  select jsonb_build_object(
    'paid_outs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', paid_out.id,
        'amount', paid_out.amount,
        'reason', paid_out.reason,
        'recorded_at', paid_out.recorded_at,
        'voided_at', paid_out.voided_at,
        'void_reason', paid_out.void_reason
      ) order by paid_out.recorded_at, paid_out.id)
      from (
        select * from public.shift_cash_paid_outs
        where restaurant_id = target_restaurant_id and shift_id = target_shift_id
        order by recorded_at, id
        limit 300
      ) paid_out
    ), '[]'::jsonb),
    'other_income_entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', entry.id,
        'category', entry.category,
        'payment_method', entry.payment_method,
        'amount', entry.amount,
        'description', entry.description,
        'reference', entry.reference,
        'recorded_at', entry.recorded_at,
        'voided_at', entry.voided_at,
        'void_reason', entry.void_reason
      ) order by entry.recorded_at, entry.id)
      from (
        select * from public.shift_other_income_entries
        where restaurant_id = target_restaurant_id and shift_id = target_shift_id
        order by recorded_at, id
        limit 300
      ) entry
    ), '[]'::jsonb)
  );
$itemized_entries$;

create or replace function public.add_shift_report_itemized_entries()
returns trigger
language plpgsql
security definer
set search_path = public
as $add_itemized_entries$
begin
  if not (new.snapshot ? 'paid_outs') or not (new.snapshot ? 'other_income_entries') then
    new.snapshot := new.snapshot
      || public.shift_report_itemized_entries(new.restaurant_id, new.shift_id);
  end if;
  return new;
end;
$add_itemized_entries$;

drop trigger if exists add_shift_report_itemized_entries on public.shift_close_reports;
create trigger add_shift_report_itemized_entries
before insert or update of snapshot on public.shift_close_reports
for each row execute function public.add_shift_report_itemized_entries();

revoke all on function public.shift_report_itemized_entries(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.shift_report_itemized_entries(uuid, uuid) to service_role;
revoke all on function public.add_shift_report_itemized_entries()
from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- Rollback: drop trigger add_shift_report_itemized_entries on
-- public.shift_close_reports; drop both functions. Versions written meanwhile
-- keep their lists (the app reads them if present, ignores them otherwise).
