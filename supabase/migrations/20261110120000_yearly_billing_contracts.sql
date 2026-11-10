-- Add annual billing contracts while preserving every existing subscription as monthly.

alter table public.plans
add column if not exists annual_price numeric(10, 2);

update public.plans
set annual_price = monthly_price * 12
where annual_price is null;

alter table public.plans
alter column annual_price set not null;

do $annual_price_constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'plans_annual_price_nonnegative'
      and conrelid = 'public.plans'::regclass
  ) then
    alter table public.plans
    add constraint plans_annual_price_nonnegative check (annual_price >= 0);
  end if;
end;
$annual_price_constraint$;

alter table public.subscriptions
add column if not exists billing_interval text not null default 'monthly';

-- Old active/past-due subscriptions may still carry their historical trial date.
-- It is no longer meaningful once the trial has ended.
update public.subscriptions
set trial_ends_at = null
where status <> 'trialing'
  and trial_ends_at is not null;

do $billing_interval_constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_billing_interval_valid'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
    add constraint subscriptions_billing_interval_valid
    check (billing_interval in ('monthly', 'yearly'));
  end if;
end;
$billing_interval_constraint$;

comment on column public.plans.annual_price is
  'Price invoiced once for a yearly subscription contract.';
comment on column public.subscriptions.billing_interval is
  'Invoice cadence and contract term: monthly or yearly.';

notify pgrst, 'reload schema';
