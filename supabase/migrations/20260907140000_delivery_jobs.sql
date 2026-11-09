-- Durable delivery, committed with status events. Migration-first deployment.
create table public.order_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  event_id uuid not null references public.order_status_events(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'push')),
  order_status public.order_status not null,
  status text not null default 'pending' check (status in ('pending','processing','accepted','skipped','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique(event_id, channel)
);
create index notification_jobs_due on public.order_notification_jobs(available_at)
  where status in ('pending','processing');
alter table public.order_notification_jobs enable row level security;
revoke all on public.order_notification_jobs from public, anon, authenticated;
grant select on public.order_notification_jobs to authenticated;
grant all on public.order_notification_jobs to service_role;
create policy notification_jobs_read on public.order_notification_jobs for select to authenticated
  using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

create function public.enqueue_order_notification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('whatsorder.async_notifications', true) = 'on'
     and new.to_status in ('Accepted','Ready to Serve','Out for Delivery','Completed','Cancelled')
     and new.from_status is distinct from new.to_status then
    insert into public.order_notification_jobs(restaurant_id, order_id, event_id, channel, order_status)
    select new.restaurant_id, new.order_id, new.id, channel, new.to_status
    from unnest(array['whatsapp','push']) as channel;
  end if;
  return new;
end $$;
revoke all on function public.enqueue_order_notification() from public, anon, authenticated;
create trigger enqueue_order_notification after insert on public.order_status_events
  for each row execute function public.enqueue_order_notification();

create function public.claim_order_notification(target_restaurant_id uuid default null)
returns setof public.order_notification_jobs
language plpgsql security definer set search_path = public as $$
declare selected_id uuid;
begin
  -- Exhausted leases are visible failures, never silently stranded processing.
  update public.order_notification_jobs set status='failed', last_error='Worker lease expired'
  where status='processing' and lease_until < now() and attempts >= 5
    and (target_restaurant_id is null or restaurant_id=target_restaurant_id);
  select id into selected_id from public.order_notification_jobs
  where attempts < 5 and available_at <= now()
    and (status='pending' or (status='processing' and lease_until < now()))
    and (target_restaurant_id is null or restaurant_id=target_restaurant_id)
  order by created_at, id for update skip locked limit 1;
  return query update public.order_notification_jobs
    set status='processing', attempts=attempts+1, lease_token=gen_random_uuid(),
        lease_until=now()+interval '5 minutes'
    where id=selected_id returning *;
end $$;
revoke all on function public.claim_order_notification(uuid) from public, anon, authenticated;
grant execute on function public.claim_order_notification(uuid) to service_role;

alter table public.daily_summary_runs
  add column lease_token uuid,
  add column lease_until timestamptz,
  add column delivery_status text not null default 'not_attempted',
  add column delivery_reason text;
-- Historical 'sent' rows only proved generation, not transport acceptance.
update public.daily_summary_runs set status='generated', delivery_status='unknown'
  where status='sent';

create function public.claim_daily_summary(target_restaurant_id uuid, target_day date)
returns uuid language plpgsql security definer set search_path=public as $$
declare token uuid := gen_random_uuid(); claimed uuid;
begin
  -- A crash after a send began is ambiguous. Preserve the recap without
  -- blindly resending an owner message whose acceptance could not be recorded.
  update public.daily_summary_runs set status='generated',delivery_status='unknown'
    where restaurant_id=target_restaurant_id and summary_date=target_day
      and status='processing' and delivery_status='sending' and lease_until < now();
  insert into public.daily_summary_runs(restaurant_id,summary_date,status,lease_token,lease_until)
  values(target_restaurant_id,target_day,'processing',token,now()+interval '10 minutes')
  on conflict(restaurant_id,summary_date) do update
    set status='processing', lease_token=token, lease_until=now()+interval '10 minutes'
    where daily_summary_runs.status='failed'
       or (daily_summary_runs.status='processing' and daily_summary_runs.lease_until < now())
  returning lease_token into claimed;
  return claimed;
end $$;
revoke all on function public.claim_daily_summary(uuid,date) from public, anon, authenticated;
grant execute on function public.claim_daily_summary(uuid,date) to service_role;

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
        'delivery_status', summary.delivery_status,
        'delivery_reason', summary.delivery_reason,
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

-- Opt-in wrappers let old and new app instances coexist during a migration-first rollout.
create function public.record_order_payment_async(
  target_restaurant_id uuid, target_order_id uuid, requested_payment_method text,
  complete_order boolean, event_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform set_config('whatsorder.async_notifications','on',true);
  return public.record_order_payment(target_restaurant_id,target_order_id,requested_payment_method,complete_order,event_actor_user_id);
end $$;
revoke all on function public.record_order_payment_async(uuid,uuid,text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.record_order_payment_async(uuid,uuid,text,boolean,uuid) to service_role;

create function public.transition_order_status_async(
  target_restaurant_id uuid, target_order_id uuid, target_status text,
  event_actor_user_id uuid, event_actor_role text, event_reason text
) returns uuid language plpgsql security definer set search_path=public as $$
begin
  perform set_config('whatsorder.async_notifications','on',true);
  return public.transition_order_status_and_record_event(target_restaurant_id,target_order_id,target_status,event_actor_user_id,event_actor_role,event_reason);
end $$;
revoke all on function public.transition_order_status_async(uuid,uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.transition_order_status_async(uuid,uuid,text,uuid,text,text) to service_role;
