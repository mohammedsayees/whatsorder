begin;
insert into public.restaurants(id,name,slug,whatsapp_number,status,is_active)
values('2d000000-0000-0000-0000-000000000001','Stripe A','stripe-a','971500000098','live',true),
('2d000000-0000-0000-0000-000000000002','Stripe B','stripe-b','971500000099','live',true);

insert into public.restaurant_stripe_accounts(restaurant_id,stripe_account_id,livemode)
values('2d000000-0000-0000-0000-000000000001','acct_1TestAAAAAAAAAAA',false);

do $$ begin
  if (select card_payments_status from public.restaurant_stripe_accounts where restaurant_id='2d000000-0000-0000-0000-000000000001') <> 'pending'
     or not (select requirements_due from public.restaurant_stripe_accounts where restaurant_id='2d000000-0000-0000-0000-000000000001') then
    raise exception 'New Stripe accounts must start pending with requirements due';
  end if;
  -- One Stripe account per restaurant, and never shared between restaurants.
  begin
    insert into public.restaurant_stripe_accounts(restaurant_id,stripe_account_id,livemode)
    values('2d000000-0000-0000-0000-000000000002','acct_1TestAAAAAAAAAAA',false);
    raise exception 'Shared Stripe account accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.restaurant_stripe_accounts(restaurant_id,stripe_account_id,livemode)
    values('2d000000-0000-0000-0000-000000000001','acct_1TestBBBBBBBBBBB',false);
    raise exception 'Second account for one restaurant accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.restaurant_stripe_accounts(restaurant_id,stripe_account_id,livemode)
    values('2d000000-0000-0000-0000-000000000002','not-an-account',false);
    raise exception 'Malformed account id accepted';
  exception when check_violation then null; end;
  begin
    update public.restaurant_stripe_accounts set card_payments_status='enabled' where restaurant_id='2d000000-0000-0000-0000-000000000001';
    raise exception 'Unknown capability status accepted';
  exception when check_violation then null; end;
  if has_table_privilege('anon','public.restaurant_stripe_accounts','select')
     or has_table_privilege('anon','public.restaurant_stripe_accounts','insert')
     or has_table_privilege('authenticated','public.restaurant_stripe_accounts','insert')
     or has_table_privilege('authenticated','public.restaurant_stripe_accounts','update') then
    raise exception 'Browsers must not write (or anonymously read) Stripe account links';
  end if;
end $$;
rollback;
