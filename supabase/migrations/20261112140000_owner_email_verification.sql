-- Instant owner access (self-serve onboarding step 4).
--
-- Owners who claim a demo store are now signed straight into their dashboard
-- instead of waiting for an activation email. Their email is not proven at
-- that point, so WhatsOrder tracks it separately from Supabase Auth:
--
--   owner_email_verified_at          set when the owner opens the
--                                    confirmation link we email them
--   owner_email_verification_due_at  end of the grace period; after it the
--                                    dashboard asks for confirmation first
--
-- Both are written only by service-role server code (restaurants writes are
-- already service-role only). No RLS or policy change.

alter table public.restaurants
  add column if not exists owner_email_verified_at timestamptz,
  add column if not exists owner_email_verification_due_at timestamptz;

-- Every existing owner reached their dashboard through an emailed invite
-- link, which already proved the address.
update public.restaurants
set owner_email_verified_at = coalesce(updated_at, now())
where owner_email is not null
  and is_demo = false
  and owner_email_verified_at is null;
