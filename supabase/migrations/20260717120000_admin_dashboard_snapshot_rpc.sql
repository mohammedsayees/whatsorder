-- Return the complete admin dashboard snapshot in one service-role-only RPC.
-- Existing aggregate functions remain the single source of truth; this wrapper
-- removes three network round trips without changing their calculations.

create or replace function public.get_admin_dashboard_snapshot(
  target_restaurant_id uuid,
  range_mode text default '7d'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $dashboard_snapshot$
  select jsonb_build_object(
    'analytics', public.get_restaurant_dashboard_analytics(target_restaurant_id),
    'trend', public.get_restaurant_dashboard_trend(
      target_restaurant_id,
      case
        when range_mode in ('7d', '30d', 'mtd') then range_mode
        else '7d'
      end
    ),
    'dailySummary', (
      select jsonb_build_object(
        'summary_date', summary.summary_date,
        'status', summary.status,
        'message_text', summary.message_text,
        'numbers', summary.numbers
      )
      from public.daily_summary_runs as summary
      where summary.restaurant_id = target_restaurant_id
      order by summary.summary_date desc
      limit 1
    ),
    'commissionTotals', public.get_restaurant_commission_kept(target_restaurant_id)
  );
$dashboard_snapshot$;

revoke all on function public.get_admin_dashboard_snapshot(uuid, text)
from public, anon, authenticated;

grant execute on function public.get_admin_dashboard_snapshot(uuid, text)
to service_role;
