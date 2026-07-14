-- History backfill: applied directly to production on 2026-06-28 (recorded
-- remotely as version 20260628030617). Verbatim from the remote migration
-- history. Execute grants were later locked to service_role by
-- 20260702120000_audit_hardening.

create or replace function public.get_loyalty_progress(p_restaurant_id uuid, p_phone text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (
      select case
        when not r.loyalty_enabled then jsonb_build_object('enabled', false)
        else jsonb_build_object(
          'enabled',            true,
          'stamps',             coalesce(c.loyalty_points_balance, 0),
          'required',           r.loyalty_stamps_required,
          'remaining',          greatest(r.loyalty_stamps_required - coalesce(c.loyalty_points_balance, 0), 0),
          'reward_available',   coalesce(c.loyalty_points_balance, 0) >= r.loyalty_stamps_required,
          'reward_description', r.loyalty_reward_description
        )
      end
      from restaurants r
      left join customers c
        on c.restaurant_id = r.id and c.phone = p_phone
      where r.id = p_restaurant_id
    ),
    jsonb_build_object('enabled', false)
  );
$function$;
