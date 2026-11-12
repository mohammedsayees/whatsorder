-- Run after all migrations. Exercises claim_demo_restaurant's store-link
-- (slug) rules and the restaurant_live task against the real schema, plus
-- the owner email verification columns. Everything rolls back.
begin;

do $self_serve_claim_store_link_test$
declare
  demo_id uuid := gen_random_uuid();
  claim_hash text := repeat('a', 64);
  claimed uuid;
  claimed_slug text;
  live_done boolean;
  rejected boolean;
begin
  if has_function_privilege(
    'anon', 'public.claim_demo_restaurant(uuid,text,text,text,text,text,text,text,text,text)', 'execute'
  ) or has_function_privilege(
    'authenticated', 'public.claim_demo_restaurant(uuid,text,text,text,text,text,text,text,text,text)', 'execute'
  ) then
    raise exception 'Browser roles can execute the slug-aware demo claim RPC';
  end if;

  if to_regprocedure('public.claim_demo_restaurant(uuid,text,text,text,text,text,text,text,text)') is not null then
    raise exception 'The old claim RPC signature (without a store link) still exists';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'restaurants'
      and column_name = 'owner_email_verified_at'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'restaurants'
      and column_name = 'owner_email_verification_due_at'
  ) then
    raise exception 'Owner email verification columns are missing';
  end if;

  insert into public.restaurants (id, name, slug, whatsapp_number, is_demo, status, plan)
  values (demo_id, 'Claim Test Cafe', 'demo-claim-test-cafe-k3x9', '971551150068', true, 'trial', 'trial');
  insert into public.restaurants (name, slug, whatsapp_number)
  values ('Taken Link Cafe', 'claim-test-taken', '971500000001');
  insert into public.demo_restaurant_claims (restaurant_id, claim_token_hash, expires_at)
  values (demo_id, claim_hash, now() + interval '1 day');

  -- Invalid, demo-prefixed and taken links are refused without claiming.
  foreach claimed_slug in array array['ab', 'claim--test', 'demo-claim-test', 'claim-test-taken'] loop
    rejected := false;
    begin
      perform public.claim_demo_restaurant(
        demo_id, claim_hash, 'claim-test-owner@example.com', '971551234567',
        'AE', 'AED', 'en-AE', '971', 'Asia/Dubai', claimed_slug
      );
    exception when others then
      rejected := sqlerrm in ('Choose a valid store link', 'This store link is already taken');
    end;
    if not rejected then
      raise exception 'Store link % was not rejected as expected', claimed_slug;
    end if;
  end loop;

  claimed := public.claim_demo_restaurant(
    demo_id, claim_hash, 'claim-test-owner@example.com', '971551234567',
    'AE', 'AED', 'en-AE', '971', 'Asia/Dubai', 'Claim-Test-Cafe'
  );

  select slug into claimed_slug from public.restaurants where id = claimed and is_demo = false;
  if claimed_slug is distinct from 'claim-test-cafe' then
    raise exception 'Claim did not set the permanent store link (got %)', claimed_slug;
  end if;

  select is_completed into live_done
  from public.onboarding_tasks
  where restaurant_id = claimed and task_key = 'restaurant_live';
  if live_done is distinct from true then
    raise exception 'Claim did not complete the restaurant_live onboarding task';
  end if;

  -- The proof is one-time: a second claim with it must fail.
  rejected := false;
  begin
    perform public.claim_demo_restaurant(
      demo_id, claim_hash, 'claim-test-owner@example.com', '971551234567',
      'AE', 'AED', 'en-AE', '971', 'Asia/Dubai', 'claim-test-cafe-2'
    );
  exception when others then
    rejected := true;
  end;
  if not rejected then
    raise exception 'A used claim proof was accepted twice';
  end if;
end
$self_serve_claim_store_link_test$;

rollback;
