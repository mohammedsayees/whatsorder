-- Keep restaurant_shifts.close_report_snapshot identical to the shift's latest
-- report version. Requires 20261121210000_shift_report_itemized_entries.sql.
--
-- The itemized-entries trigger adds paid_outs / other_income_entries to the
-- version written into shift_close_reports. The writers also store the same
-- snapshot on the shift row (close_report_snapshot), and that copy must equal
-- the latest version (the report tests check this). Without this sync the
-- shift row would be missing the lists.
--
-- 1. AFTER INSERT OR UPDATE OF snapshot: when the written version is the
--    shift's current close_report_version, copy the final snapshot to the
--    shift row. Writers that update the shift row after writing the report
--    (e.g. the correction path) merge into that copy with ||, so the lists are
--    kept.
-- 2. Because the shift row now carries the lists, writers that build the next
--    version from it (corrections, recalculation after a paid-out void) would
--    pass the PREVIOUS version's lists along. The itemizing trigger therefore
--    always recomputes the lists for a new version (INSERT); on UPDATE it only
--    fills them in when missing, as before.

begin;
set local lock_timeout = '5s';

create or replace function public.add_shift_report_itemized_entries()
returns trigger
language plpgsql
security definer
set search_path = public
as $add_itemized_entries$
begin
  -- A new version records the entries as they are now; an update in the same
  -- transaction keeps lists it already has.
  if tg_op = 'INSERT'
     or not (new.snapshot ? 'paid_outs') or not (new.snapshot ? 'other_income_entries') then
    new.snapshot := (new.snapshot - 'paid_outs' - 'other_income_entries')
      || public.shift_report_itemized_entries(new.restaurant_id, new.shift_id);
  end if;
  return new;
end;
$add_itemized_entries$;

revoke all on function public.add_shift_report_itemized_entries()
from public, anon, authenticated;

create or replace function public.sync_shift_report_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $sync_shift_report_snapshot$
begin
  update public.restaurant_shifts
  set close_report_snapshot = new.snapshot
  where id = new.shift_id
    and restaurant_id = new.restaurant_id
    and close_report_version = new.version
    and close_report_snapshot is distinct from new.snapshot;
  return null;
end;
$sync_shift_report_snapshot$;

drop trigger if exists sync_shift_report_snapshot on public.shift_close_reports;
create trigger sync_shift_report_snapshot
after insert or update of snapshot on public.shift_close_reports
for each row execute function public.sync_shift_report_snapshot();

revoke all on function public.sync_shift_report_snapshot()
from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- Rollback: drop trigger sync_shift_report_snapshot on public.shift_close_reports;
-- drop function public.sync_shift_report_snapshot(); re-apply
-- add_shift_report_itemized_entries from 20261121210000.
